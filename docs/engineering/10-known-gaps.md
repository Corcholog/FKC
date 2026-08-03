# 10 — Known Gaps

An honest inventory. For a portfolio project this page is an asset, not a liability:
knowing precisely what's missing and why is a stronger signal than a README that claims
everything is done.

## 1. No automated tests — the biggest gap

There is no test suite. CI (`.github/workflows/ci.yml`) runs `npm run typecheck`,
`npm run lint` and `npm run build` on every push and PR, which gates types and lint but
proves nothing about behaviour.

CI lints with the project's own `npm run lint` rather than `--max-warnings=0`, because
four pre-existing `next/no-img-element` warnings would make it red from its first run, and
a permanently red CI is indistinguishable from no CI. Clear those, then tighten it.

What makes this particularly worth fixing is that **the codebase is already shaped for
it.** Every module in `src/lib/*-stats.ts`, plus `rank.ts`, `sessions.ts`, `streaks.ts`,
`duo-stats.ts`, `matchups.ts` and `time-stats.ts`, is pure: plain rows in, plain aggregates
out, zero I/O. They can be tested with no mocks, no database, and no framework harness.

The highest-value tests, roughly in order:

| Target | What it pins down |
|---|---|
| `ladderPoints` / `formatLadderPoints` round-trip | The apex-tier branch and the unranked-is-null rule |
| `SlidingWindowLimiter` (fake timers) | The chained-acquire race and the `notifyRateLimited` pause |
| `computeStreak` | The signed-accumulator flip, and that it sorts its own input |
| `groupIntoSessions` | Gap measured from game *end*, not start |
| `aggregateDuoStats` | Canonical pair ordering; five-stack → 10 pairs |
| `aggregatePlayerStats` | The `detailGames` split and the two-clock per-minute rule |
| `nemesis` | Most-losses-first with winrate as tiebreak |
| `toParticipantRow` | `undefined` → `null` normalisation for missing Riot fields |

The sync walk itself is the one piece that needs real design work to test — it takes a
`SupabaseClient` directly, so testing it means either a fake client or extracting the walk
logic from the I/O. That extraction is worth doing anyway.

## 2. No Postgres-side aggregation

Every stats page selects all relevant `match_participants` rows and folds them in
JavaScript. At five players and a few hundred games that's a few thousand rows and it's
genuinely fine. It breaks down when either the roster or the history grows by an order of
magnitude.

The migration path is clear: materialized views or RPC functions for the aggregates,
keeping the same `XAgg` shapes so the rendering layer doesn't change. `/insights` is the
page to convert first — it aggregates over the entire participant table.

**Budget for `statement_timeout` when doing it.** The `authenticator` role this project
runs under is configured with `statement_timeout=8s` and `lock_timeout=8s`:

```sql
select rolname, rolconfig from pg_roles where rolname = 'authenticator';
-- {session_preload_libraries=..., statement_timeout=8s, lock_timeout=8s}
```

Paged reads are unaffected — each page is its own short query, so paging is *safer* here
than one large select. But a single aggregate RPC or a `refresh materialized view` over the
whole participant table is exactly the shape that hits an 8s ceiling, and it fails as a
query error at request time rather than as slowness. Anything moved server-side wants
either an index that keeps it well under, or a scheduled refresh running as a role without
that cap.

**What was fixed, and what wasn't.** This entry used to say "unbounded", and that was a
correctness bug hiding behind a scaling note. PostgREST truncates every response at the
project's "Max rows" setting (1000 by default) *silently* — so a big enough history didn't
make these pages slow, it made them wrong, with no signal. Worse, `refreshPlayerRank`
counted wins the same way and **persisted** the wrong total to `players.wins`/`losses`.

Those reads now go through `lib/supabase/fetch-all.ts` (paging plus `.in()` chunking) and
the counts are `head: true` count queries. See ADR-024. That makes the reads honest; it
does **not** move the aggregation, so everything above still stands.

## 3. No generated database types

`.select("player_id, team_position, win, …")` is a string. A typo or a renamed column is a
runtime `undefined`, not a compile error. Types are hand-declared per page:

```ts
type ParticipantRow = { id: string; match_id: string; /* … */ };
```

`supabase gen types typescript` would close this, and it's the single highest
value-per-effort improvement available. It would also have caught the stale
`scripts/validate_palette.js` class of drift described in §6.

## 4. No admin role

`/settings` is open to every signed-in user. That means any player can add or delete roster
members, rotate the Riot key, remove another player's login (including deleting their
`auth.users` row), set another player's password, and edit the clan AI context. Several of
those actions take a plain string argument, so they're invocable as bare server-action
POSTs without going near the UI.

This is deliberate for a five-person friend group and is flagged in the roadmap as "not
done, deliberately". It's also the first thing that must change if the app is ever shared
beyond people who already trust each other completely — probably as a `players.is_admin`
column plus RLS on the mutating paths.

This used to be entangled with a second, worse problem: `sync_state` carried a `for all`
policy for `authenticated`, so any signed-in user could read the plaintext Riot API key
straight out of the browser console. That was credential exposure rather than an
over-permissive admin UI, and migration 011 closed it (ADR-023). What's left here is the
genuine admin-role gap and nothing else.

## 5. Observability is a database row plus a webhook

No structured logging, no error tracking, no metrics.

A failed sync and an expired Riot key now push to Discord (`src/lib/discord.ts`, ADR-025),
which covers the case this entry was really about: a cron failing silently at 07:00 with
nobody looking at `last_error`. Promotions/demotions and the daily recap go the same way.

Still missing: structured logging, an error tracker, and a `sync_runs` history table
instead of one overwritten row — there is still no way to answer "how long has this been
failing?" or "when did this last succeed before today?".

## 6. Small known inconsistencies

**`scripts/validate_palette.js` doesn't exist.** `chart-theme.ts` tells you to re-run it if
you change `SERIES_COLORS`:

```ts
//   node scripts/validate_palette.js "<hexes>" --mode dark --surface "#10151d"
```

There is no `scripts/` directory. The validation was clearly done, but the tool wasn't
committed — so the instruction can't be followed. Either commit the script or drop the
line.

**`docs/05_DESIGN_SYSTEM.md` is stale.** It documents the original blue/navy palette
(`--color-blue-primary: #3B82F6`, blue-for-win, grey-for-loss). The app now ships a hextech
gold/cyan theme with green/red win/loss. `src/app/globals.css` is the real design system;
that doc is a planning artifact. (This is part of why the planning docs stay unpublished —
see this folder's README.)

**Player slugs aren't stable.** `slug` is regenerated from the Riot ID on rename, so
`/player/[slug]` URLs break when someone changes their name. Harmless internally; would
matter if anything ever linked in from outside.

**The clan crest is a placeholder.** `Crest()` in the navbar renders a styled `FC` div, and
`public/` is empty.

**Avatar upload isn't validated.** `settings/actions.ts` takes `file.type` from the client
verbatim as the stored `contentType`, derives the file extension from the untrusted
filename, and enforces no size cap or MIME allowlist — into a *public* Storage bucket. An
`image/svg+xml` or `text/html` upload is stored XSS on the Supabase storage origin. Small
fix, not yet done.

**No security headers.** `next.config.ts` sets `images.remotePatterns` and nothing else —
no CSP, `X-Frame-Options` or `Referrer-Policy`, and `poweredByHeader` is left on.

**No `Suspense` or `next/dynamic` anywhere.** Every route uses `loading.tsx`, so the whole
page is withheld until the slowest query resolves rather than streaming in parts. recharts
and `@dnd-kit` are statically imported into client bundles.

**The match-row assembly is copy-pasted three times.** The `toChampion` +
`allies`/`enemies`/`opponent` + `participantsByMatch` block, and its byte-identical
14-column select string, appear in `page.tsx`, `matches/page.tsx` and
`player/[slug]/page.tsx`. One `lib/match-rows.ts` would remove ~120 duplicated lines.
`ParticipantRow` is likewise redeclared verbatim in the same three files — which §3 above
would also fix.

## 7. Deliberate non-features

These are choices, not omissions:

- **No Match-V5 timeline.** First-blood *victim*, and gold/CS differentials at 10/15
  minutes, need a second call per match with a much larger payload. At ~1.2s per call that
  roughly doubles sync cost. Explicitly declined in the Riot integration notes.
- **No light theme.** One permanent dark theme; a toggle would be dead weight.
- **No public signup.** The app is private by construction.
- **No re-fetching of stored matches during a normal sync.** Match data is immutable once a
  game ends; `refetchMatchDetails` is the explicit manual exception.
- **A summary can stay stale indefinitely.** `/api/summaries` only rewrites one after
  `MIN_NEW_GAMES` new games, so a player who plays three and stops keeps the old text and a
  `stale` flag forever. That is the intended trade (ADR-021) — the alternative is spending a
  metered daily request to rewrite a summary that would read almost identically — and the
  player page says so rather than promising a refresh that isn't coming. Writing a note or
  editing AI context sets `force_regenerate` and bypasses it, which covers the case where
  someone actually wants an update now.
- **The player summary can't cite anything outside its window or its splits.** By design:
  it sees 30 games individually plus precomputed aggregates, and is told not to derive
  totals by counting. A question like "how did they do on Ziggs eight months ago" has no
  answer in the prompt, and the correct output is to say there isn't one.

## 8. Not yet built

**Phase 14 — private per-player AI chat.** The only roadmap item never started. All the
identity groundwork exists (per-player `auth.users`, `players.user_id`, owner-scoped RLS
patterns), so what's left is chat tables with RLS scoped to `auth.uid()`, plus the
conversational UI. Everything else stays group-visible; only the chat is private.

## 9. What would break first at 10× scale

In the order it would actually hurt:

1. **The Riot rate limit.** 50 players × a daily sync exceeds what 60-second invocations
   can cover, even with perfect resumption. Fix: a production API key, or fan out across
   multiple invocations with a work-queue table.
2. **JavaScript aggregation.** `/insights` selects the entire participant table. At 50
   players it's hundreds of thousands of rows into memory on every page view.
3. **The single-row sync lock.** Fine for one job; wrong the moment work is sharded across
   parallel invocations.
4. **The Gemini per-day quota.** Capped at roster + 1 per day and usually well under it
   since the `MIN_NEW_GAMES` floor skips anyone who barely played, but 50 active players
   still means up to 51 calls — past the free tier on any busy day.
5. **No admin role.** At any size beyond a friend group this becomes the first real
   security problem, not the last.
