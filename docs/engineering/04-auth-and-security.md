# 04 — Auth & Security

The access model is small but has a few genuinely non-obvious pieces: four different
Supabase clients, a permission that RLS *can't* express, and a login flow that resolves
a display name to an email through a `security definer` function.

## 1. The access model

There is **no public signup**. Two kinds of account, both created by hand:

| Account | Created | Can read | Can write notes |
|---|---|---|---|
| Shared viewer | Supabase dashboard | Everything | No — owns no games |
| Per-player | `/settings`, service-role client | Everything | Only on their own games |

There is also **no admin role**. `/settings` — roster CRUD, the Riot key, login creation
— is open to every signed-in user. That's a deliberate scope decision for a five-person
friend group, and it's called out again in [10](10-known-gaps.md) as the thing that
would have to change first if the app ever grew.

## 2. Four Supabase clients

The most common Supabase mistake is using the wrong one. `src/lib/supabase/`:

| File | Factory | Runs in | Key | RLS |
|---|---|---|---|---|
| `client.ts` | `createBrowserClient` | Browser | publishable | **enforced** |
| `server.ts` | `createServerClient` + `cookies()` | RSC, Server Actions, Route Handlers | publishable | **enforced** |
| `middleware.ts` | `createServerClient` + request/response jars | `src/proxy.ts` | publishable | **enforced** |
| `admin.ts` | `createClient` | Server only | **secret** | **bypassed** |

`admin.ts` is the dangerous one. Its rules:

```ts
// Never import from a Client Component. Never expose SUPABASE_SECRET_KEY.
auth: { autoRefreshToken: false, persistSession: false }
```

Those two flags matter: an admin client has no user session and shouldn't try to
maintain one — in a serverless context that would be pure overhead and a footgun.

It is used in exactly four places, and each has a reason:
1. `/api/sync` — Vercel Cron has no user session.
2. `/api/summaries` — same, plus it writes summaries for *every* player, not the caller's.
3. `settings/actions.ts` — creating/deleting `auth.users`, and writing `players.user_id`
   (which the `authenticated` role is not granted).
4. Avatar upload/delete in Supabase Storage.

The proxy client needs its own factory because it must write refreshed session cookies
onto both the request (so downstream handlers see them) and the response (so the browser
gets them) — a different cookie plumbing than either of the other two.

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
if (pathname.startsWith("/api/")) return supabaseResponse;  // routes do their own auth
if (!user && !isPublicPath) redirect("/login");
if (user && isPublicPath)  redirect("/");
```

`/api/*` is excluded because `/api/sync` accepts a `CRON_SECRET` bearer token instead of
a session, and because an API route must return JSON — an HTML redirect would break the
navbar's `res.json()` call.

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
