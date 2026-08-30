# 04 — Auth & Security

The access model is small but has a few genuinely non-obvious pieces: five different
Supabase clients, a permission that RLS *can't* express, a login flow that resolves
a display name to an email through a `security definer` function, and — since the demo
— one deliberately public read path that works by *bypassing* RLS in a controlled way.

## 1. The access model

There is **no public signup**. Two kinds of account, both created by hand:

| Account | Created | Can read | Can write notes |
|---|---|---|---|
| Shared viewer | Supabase dashboard | Everything | No — owns no games |
| Per-player | `/settings`, service-role client | Everything | Only on their own games |

Since the demo there is also a third caller with no account at all: **anonymous readers
of `/demo`**, who can read the `demo_*` views and nothing else. That surface is its own
section (§10) because it inverts the assumption the rest of this document rests on.

There is also **no admin role**. `/settings` — roster CRUD, the Riot key, login creation
— is open to every signed-in user. That's a deliberate scope decision for a five-person
friend group, and it's called out again in [10](10-known-gaps.md) as the thing that
would have to change first if the app ever grew.

## 2. Five Supabase clients

The most common Supabase mistake is using the wrong one. `src/lib/supabase/`:

| File | Factory | Runs in | Key | Role | RLS |
|---|---|---|---|---|---|
| `client.ts` | `createBrowserClient` | Browser | publishable | caller's | **enforced** |
| `server.ts` | `createServerClient` + `cookies()` | RSC, Server Actions, Route Handlers | publishable | caller's | **enforced** |
| `middleware.ts` | `createServerClient` + request/response jars | `src/proxy.ts` | publishable | caller's | **enforced** |
| `public.ts` | `createClient`, **no cookie jar** | `/demo` pages only | publishable | always `anon` | **enforced** |
| `admin.ts` | `createClient` | Server only | **secret** | service role | **bypassed** |

`admin.ts` is the dangerous one. Its rules:

```ts
// Never import from a Client Component. Never expose SUPABASE_SECRET_KEY.
auth: { autoRefreshToken: false, persistSession: false }
```

Those two flags matter: an admin client has no user session and shouldn't try to
maintain one — in a serverless context that would be pure overhead and a footgun.

It is used in six places, and each has a reason:
1. `/api/sync` — Vercel Cron has no user session.
2. `/api/summaries` — same, plus it writes summaries for *every* player, not the caller's.
3. `/api/weekly` — same, for the weekly Discord recap.
4. `/api/demo-summaries` — writes demo drafts for every aliased player and for the clan
   recap, and reads `demo_aliases`, which has no policy for the signed-in role (§10).
5. `settings/actions.ts` — creating/deleting `auth.users`, writing `players.user_id`
   (which the `authenticated` role is not granted), and publishing demo text.
6. `settings/page.tsx` — reading `demo_aliases` / `demo_text` for the review UI.

Plus avatar upload/delete in Supabase Storage, which goes through the same factory.

The proxy client needs its own factory because it must write refreshed session cookies
onto both the request (so downstream handlers see them) and the response (so the browser
gets them) — a different cookie plumbing than either of the other two.

`public.ts` needs its own factory for the opposite reason: it must **not** have a cookie
jar. `/demo` is reachable while signed in — on purpose, since the only people who can
tell whether an alias slipped are the ones who know the real names — and the cookie-aware
server client would run those pages as `authenticated`, where RLS hands back the real
tables. A demo page that queried `players` by mistake would then render real names for
exactly the reviewers least likely to notice, and aliases for everyone else. With `anon`
pinned, that same mistake fails closed with a permission error.

## 3. The proxy gate

`src/proxy.ts` → `updateSession()` in `src/lib/supabase/middleware.ts`.

```ts
// Must call getUser(), not getSession().
const { data: { user } } = await supabase.auth.getUser();
```

`getSession()` reads the cookie and trusts it. `getUser()` revalidates against Supabase's
auth server — which is both the real authentication check and the thing that triggers
token refresh. Using `getSession()` in middleware is the standard Supabase-SSR footgun:
sessions silently stop refreshing and users get logged out mid-visit.

Three routing rules:

```ts
if (pathname.startsWith("/api/")) return supabaseResponse;      // routes do their own auth
if (!user && !isPublic(pathname)) redirect("/login");           // prefix-aware
if (user && PUBLIC_PATHS.includes(pathname)) redirect("/");     // exact match only
```

`/api/*` is excluded because `/api/sync` accepts a `CRON_SECRET` bearer token instead of
a session, and because an API route must return JSON — an HTML redirect would break the
navbar's `res.json()` call.

**The two public checks are deliberately asymmetric**, and that asymmetry is the whole
reason there are two constants:

```ts
const PUBLIC_PATHS    = ["/login"];   // exact
const PUBLIC_PREFIXES = ["/demo"];    // subtree
```

Signed *out*, both are reachable. Signed *in*, only `/login` bounces you — a login form
is meaningless once you have a session, but bouncing a signed-in user off `/demo` would
make the demo unreviewable by the only people qualified to review it. Widening the second
check to `isPublic()` would look like a tidy-up and would quietly remove the review path.

**Route protection is not the only defence.** `requireSession()` /
`requireSessionPlayer()` (`src/lib/auth.ts`) re-check in every Server Action and route
handler. Server Actions are POST endpoints reachable independently of navigation, so
relying on the proxy alone would be a real hole.

## 4. RLS: everything shared except notes

Every table has RLS enabled. Eight of nine use the same policy:

```sql
create policy "authenticated_full_access" on <table>
  for all using (auth.role() = 'authenticated');
```

Everyone with a login is equally "in the group" for roster, matches, rank history,
summaries, and sync state.

**`match_notes` is the exception** — the one table with a real owner:

```sql
create policy "notes_select_all" on match_notes
  for select using (auth.role() = 'authenticated');

create policy "notes_insert_own" on match_notes
  for insert with check (
    author_user_id = auth.uid() and public.owns_participant(match_participant_id)
  );

create policy "notes_update_own" on match_notes
  for update using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid());

create policy "notes_delete_own" on match_notes
  for delete using (author_user_id = auth.uid());
```

Read: everyone. Insert: only on a participant row that is one of *your* games, and only
claiming yourself as author. Update/delete: only your own notes.

`owns_participant()` is `stable security definer`, walking
`match_participants → players → user_id`. `security definer` so the policy check doesn't
itself depend on the caller's read policies — a policy that recursively depends on
policies is how you get infinite recursion errors in Postgres.

### The gotcha: a blocked write is not an error

**RLS does not raise on a rejected UPDATE or DELETE. It matches zero rows.** So this
looks like success:

```ts
await supabase.from("match_notes").update({ note }).eq("id", id);   // silently no-ops
```

Every write path chains `.select("id")` and treats an empty result as a permission
failure:

```ts
// src/app/(app)/notes/actions.ts
const { data, error } = await supabase
  .from("match_notes").update({ note, updated_at: … }).eq("id", id)
  .select("id");
if (error) return { error: error.message };
if (!data || data.length === 0) return { error: NOT_YOUR_NOTE };
```

This is the single most important RLS habit in the codebase.

`addNote` additionally pre-checks ownership in application code *before* inserting.
That's redundant with the policy on purpose: RLS gives a raw policy-violation error
string, the pre-check gives "You can only write notes on your own games."
**Belt-and-braces where RLS is the belt** — the app-level check is for the message, not
for the security.

## 5. The permission RLS cannot express

RLS operates on rows. Two columns on `players` need to be protected at *column* level:

- **`user_id`** — otherwise any authenticated user could re-point another player's row at
  their own account and take over their notes.
- **`display_name`** — it doubles as a login identifier. If editable, renaming yourself
  to someone else's display name would either collide with the unique index or (worse,
  if you renamed first) hijack their login lookup.

Postgres grants are the tool, with a trap:

> **A column-level `REVOKE` does not subtract from a table-level `GRANT`.**

And Supabase grants table-level `UPDATE` to `authenticated` by default. So the table-level
grant must be dropped entirely and re-granted per column:

```sql
revoke update on players from authenticated, anon;
grant update (
  id, riot_game_name, riot_tag_line, slug, avatar_url, platform,
  tier, division, league_points, wins, losses, rank_updated_at, created_at,
  ai_context
) on players to authenticated;
```

Two consequences to keep in mind:

- **Any column a signed-in user needs to write must be on that list**, or it's silently
  read-only for the app. Adding a column to `players` means remembering to add it here.
- `synced_through` is deliberately *absent* — only the sync writes it, and the sync uses
  the service-role client.

## 6. Login: display name → email

Supabase Auth has no username-only mode; every `auth.users` row needs an email. But a
display name is far easier to remember, and the group has no real emails registered.

**Account creation** (`createPlayerLogin`, `settings/actions.ts:416`):

```ts
const placeholderEmail = `${randomUUID()}@player.invalid`;
await admin.auth.admin.createUser({
  email: placeholderEmail,
  password,
  email_confirm: true,   // no SMTP configured — usable immediately
});
```

`.invalid` is the RFC 2606 "always invalid" TLD, so the address can never route anywhere.
It exists purely to satisfy Supabase's format check and is never seen or typed by anyone.
`email_confirm: true` skips the verification email that could never be delivered.

If linking the new user to the player row fails, the auth user is deleted — no stranded,
unlinked login.

**Sign-in** (`src/app/login/page.tsx`), from the *unauthenticated* browser:

```ts
let email = trimmed;
if (!trimmed.includes("@")) {
  const { data: resolved } = await supabase.rpc("resolve_login_email", {
    p_display_name: trimmed,
  });
  if (!resolved) { setError(INVALID_CREDENTIALS); return; }
  email = resolved;
}
await supabase.auth.signInWithPassword({ email, password });
```

Backed by:

```sql
create or replace function public.resolve_login_email(p_display_name text)
returns text language sql stable security definer set search_path = public
as $$
  select au.email from players p
  join auth.users au on au.id = p.user_id
  where lower(p.display_name) = lower(p_display_name)
  limit 1;
$$;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
```

Worth defending explicitly, because "an anon-callable function that reads `auth.users`"
sounds alarming:

- `security definer` is *required* — `anon` cannot read `auth.users` directly.
- `set search_path = public` is the standard hardening for `security definer` functions;
  without it a caller could shadow `players` with their own schema object.
- The function returns **only an email, never any other column or row**, and only for a
  display name that is already known to whoever is trying to log in.
- The exposure is: someone who guesses a valid display name learns a
  `<uuid>@player.invalid` placeholder that routes nowhere and is useless without the
  password.
- Failure returns the **same message as a wrong password** (`INVALID_CREDENTIALS`), so
  the form doesn't confirm whether a display name exists.

The residual risk is username enumeration via response timing, which for a five-person
private app is not worth engineering against — but naming it is better than pretending
it isn't there.

## 7. Session helpers

`src/lib/auth.ts`:

```ts
export const getSession = cache(async (): Promise<Session | null> => { … });
```

React's `cache()` dedupes the `getUser()` + `players` lookup across a single render pass.
Without it, the layout and any page component that both need the session would each pay
two round trips.

`Session.player` is `null` for the shared viewer account — it can read everything but
owns no games, which is exactly why `addNote` starts with `if (!player) return { error:
NOT_YOUR_GAME }`.

## 8. Secrets and what's exposed

| Value | Where | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | env | Public by design |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | env | Public by design — RLS is the boundary |
| `SUPABASE_SECRET_KEY` | env | **Server only.** Bypasses RLS entirely |
| `GEMINI_API_KEY` | env | Server only |
| `CRON_SECRET` | env | Server only; compared against a bearer header |
| Riot API key | **`sync_state` table** | Readable by any authenticated user |

The Riot key placement is the one genuine security compromise, taken so a key that
expires daily doesn't require a daily redeploy. In a multi-tenant app it would need its
own service-role-only table. See [09, ADR-002](09-decision-log.md).

## 9. Deleting a player

`deletePlayer` (`settings/actions.ts:374`) deletes the row, removes the avatar from
Storage, and — importantly — **deletes the linked `auth.users` row**. Leaving it would
strand a login that can still sign in and read the entire private site while being
attached to no player.

`removePlayerLogin` does the same for the login alone. It is deliberately *not* a pure
unlink, for the same reason. The player's notes survive with `author_user_id` set to NULL
(`ON DELETE SET NULL`) — they become read-only rather than disappearing, which is right,
because notes are the only irreplaceable data in the database.

## 10. The public demo

Everything above assumes "no session ⇒ no data". `/demo` is the exception: a read-only,
identity-stripped copy of the whole app that a stranger can open. It exists because a
member of the group applied for a coaching role and needed to show the tool to a hiring
staff who obviously cannot be given logins.

The requirement is not "the pages display aliases". It is **there is no path by which a
real name leaves the database**. Three independent layers, each sufficient on its own:

**1. The view is the projection.** `demo_players` has no `riot_game_name`, no `puuid`, no
`ai_context`, no `user_id` — there is nothing to filter because the column does not exist.
This is why the obfuscation lives in Postgres rather than in the render layer: a render-layer
filter is a line of code somebody can forget, and forgetting it is invisible. The proof
that this matters is `player/[slug]/page.tsx`, which does `.select("*")` on players — the
widest select in the app. Against the view that is safe *by construction*.

**2. `anon` cannot read the real tables.** Already true before the demo: every base table
is `authenticated`-only. Migration 018 adds `grant select` on the views and **touches no
existing policy**, so `anon`'s access to real data is exactly what it was — none.

**3. The demo pages hold a session-less client.** `createPublicClient()` never attaches
cookies, so its JWT is `anon` even for a signed-in visitor (§2).

### Why the views run with `security_invoker` off

A Postgres view defaults to `security_invoker = off`, meaning it executes as its **owner**
(`postgres`) and therefore reads the base tables *without* the caller's RLS applying. The
view's own column list is what constrains the caller. That is normally a footgun — it is
the thing Supabase warns about — and here it is the mechanism, used in one direction only:
the views expose strictly less than the tables, and `anon` has `select` on nothing else.

> **Do not add `with (security_invoker = on)` to these views.** They would return zero
> rows for `anon` and the demo would render empty in production **with no error anywhere** —
> RLS denies by matching no rows, not by raising.

That warning is repeated at the top of `docs/migrations/018_demo_views.sql`, because the
migration is where somebody would actually be standing when they were tempted.

### The mapping tables are not public

`demo_aliases` joins a puuid to an alias. Published, it would undo the entire file in one
request. So the three mapping tables (`demo_aliases`, `demo_opponent_aliases`, `demo_text`)
carry the ordinary `authenticated`-only policy and are granted to `anon` nowhere. They are
back-office data, which is also why `/settings` reads them through the **admin** client
rather than the caller's.

Verified from outside, with the publishable key:

```bash
curl "$URL/rest/v1/demo_players?select=display_name,slug" -H "apikey: $PUBLISHABLE_KEY"
# → [{"display_name":"Nova","slug":"nova"}, …]

curl "$URL/rest/v1/players?select=riot_game_name"          -H "apikey: $PUBLISHABLE_KEY"
# → []                       (RLS: zero rows, not an error)

curl "$URL/rest/v1/demo_text?select=body"                  -H "apikey: $PUBLISHABLE_KEY"
# → 42501 permission denied for table demo_text

curl "$URL/rest/v1/demo_players?select=riot_game_name"     -H "apikey: $PUBLISHABLE_KEY"
# → 42703 column does not exist      ← layer 1, proven rather than assumed

curl "$URL/rest/v1/demo_team_summary?select=source"        -H "apikey: $PUBLISHABLE_KEY"
# → 42703 column does not exist      ← same, for the recap's projection
```

The last two are the checks worth keeping: they prove a column is *absent*, not merely
unselected. `demo_team_summary` (migration 021) is the sharpest case — it is a view over
`demo_text`, the one table that must never be public, and it publishes exactly one row of
it. Leaving `source` and `row_id` out of the select list is what makes that "exactly one"
structural: with them exposed, a filter on the querystring would reach every draft and every
override in the table.

### Free text is opt-in, never filtered

Prose is the one thing projection cannot anonymize — a match note names people, quotes
them, and carries the group's slang. So no real text column appears in any view. The views
`left join` `demo_text` instead, which means **a row with no override shows no text**. The
failure mode of forgetting to write an override is a blank panel; the failure mode of a
filter-based approach is a published in-joke.

`match_notes`, `team_game_notes`, `player_ai_summaries`, `team_ai_summary`, `clan_profile`
and `sync_state` have **no view at all**. The last two are the most dangerous in the
database: `clan_profile.context` is described in its own schema comment as holding inside
jokes, slang and nicknames, and `sync_state` holds the plaintext Riot key plus a
`last_error` in which Riot embeds puuids.

### The AI text passes through a human

The demo's player summaries are generated by a second prompt profile (see
[06](06-ai-layer.md)) and land in `demo_text` under `source = 'player_summary_draft'`.
The public view `demo_player_summaries` (migration 019) selects
`source = 'player_summary'` and nothing else. Publishing is a button in `/settings` that
copies one row to the other.

Those two sources exist because the review step has to be real, and briefly wasn't:
generation originally wrote straight into the published row, so the first three summaries
were live before anyone had read them. `source` is already half of `demo_text`'s primary
key, so splitting them needed no schema change. See [09, ADR-039](09-decision-log.md).

`/api/demo-summaries` is also, unlike `/api/summaries`, **deliberately not on the cron**.
A nightly job that rewrites public prose unattended is the exact thing the review gate
exists to prevent.

### Residual risks, accepted and named

- **`resolve_login_email(text)` is executable by `anon`** (§6) and the site now has a page
  a stranger can reach. Unchanged in substance: it returns a `<uuid>@player.invalid`
  placeholder that routes nowhere and is useless without the password, and the login form
  answers identically for an unknown name and a wrong password.
- **`matches.game_creation` + duration + champion set** is, in principle, enough to
  identify a specific LAS game with effort. Not obfuscated, because shifting timestamps
  would break the hour heatmap and the LP series — which are part of what the demo is for.
- **The demo has no automated tests.** Every leak check so far has been a manual sweep of
  the rendered RSC payload against a needle set built from the live database. That is a
  real gap, listed in [10](10-known-gaps.md).
