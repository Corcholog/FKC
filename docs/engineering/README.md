# Engineering Documentation

As-built documentation for the Fake Clan team tracker: what the system does, how each
part works, and *why* it was built the way it was.

This is deliberately separate from `docs/*.md` at the level above, which is the
**pre-build spec** — a planning artifact written before any code existed. Where the two
disagree, the code and this folder win. Divergences are called out explicitly in
[10-known-gaps.md](10-known-gaps.md).

## What the app is

A private web app for one five-person League of Legends team ("Fake Clan") to track every
game they play: solo queue, ranked flex, and the scrims, friendlies and tournament officials
that Riot's API does not serve. It syncs match and rank data once a day, stores it in
Postgres, and renders the team's record, per-player depth across all three sources, the
solo queue awards and draft preparation.

It was two trackers until ADR-050 — a soloQ tracker for a wider friend group *plus* a
competitive tracker for five of them — and a lot of these docs still carry the reasoning from
that period. Where a section describes the split, or the public `/demo` mirror that was
deleted with it, it says so at the top and is kept for the argument rather than the fact.

It runs entirely on free tiers: Vercel Hobby, Supabase Free, and a Riot *personal* API
key. **Almost every interesting decision in this codebase traces
back to a free-tier ceiling**, and that is the through-line worth following if you only
read one thing.

## Reading order

If you're coming to this cold, read 01 → 02 → 03. Those three cover the spine of the
system. Everything else can be read on demand.

| # | Doc | What it covers |
|---|---|---|
| 01 | [System overview](01-system-overview.md) | Stack, topology, request lifecycle, where the code lives |
| 02 | [Data model](02-data-model.md) | Every table, the invariants that hold them together |
| 03 | [Sync engine](03-sync-engine.md) | Riot API, rate limiting, the incremental walk, exclusion rules |
| 04 | [Auth & security](04-auth-and-security.md) | Four Supabase clients, RLS, column grants, login flow |
| 05 | [Stats & domain logic](05-stats-and-domain-logic.md) | The pure-function layer, aggregation conventions, rank math |
| 06 | [AI layer](06-ai-layer.md) | **Deleted feature.** Gemini, quota economics, prompts — kept for the reasoning |
| 07 | [Frontend](07-frontend.md) | App Router structure, RSC data fetching, design tokens, charts |
| 08 | [Operations](08-operations.md) | Env vars, deploys, cron, runbook, what breaks first |
| 09 | [Decision log](09-decision-log.md) | The load-bearing decisions (ADR-001 to ADR-052), with context and consequences |
| 10 | [Known gaps](10-known-gaps.md) | What's missing, what's stale, what would break at 10× scale |

## Conventions used in these docs

- File references are repo-relative and clickable: `src/lib/sync.ts:318`.
- "The walk" always means the backwards traversal of a player's match history in
  `syncPlayerMatches`.
- "Tracked player" means a row in `players`. Since migration 028 that is exactly the five
  of them, one per position. The other participants in any given match are "untracked" —
  including anybody who used to be on the roster and no longer is.

- "A source" means one of the three kinds of game — `soloq`, `flexq`, `team` — and a
  *named source* is a preset over them: `all`, `competitive`, `flex`, `soloq`
  (`src/lib/scope.ts`). "A queue" is narrower and always means Riot's: 420 or 440.

## The one-paragraph version

A Vercel Cron job hits `/api/sync` once a day. That route claims a lock on a singleton
`sync_state` row, then walks each tracked player's Riot match history backwards from
newest, inserting any match it hasn't seen along with all ten participants' stats, and
stops when it reaches a point it can prove is already covered. Every Riot call goes
through a sliding-window rate limiter, and the whole run is bounded by a wall-clock
deadline well short of Vercel's 60-second function ceiling — an interrupted run is
normal and resumable, not an error. Every page is a React Server Component that reads Postgres directly through Supabase with RLS
enforced, aggregates in JavaScript, and renders. There is no client-side data fetching
anywhere except the sync button and the login form. Every route sits behind the session
gate in `src/proxy.ts`; `/login` is the only page a signed-out visitor reaches.
