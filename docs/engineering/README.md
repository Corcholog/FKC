# Engineering Documentation

As-built documentation for the Fake Clan SoloQ Tracker: what the system does, how each
part works, and *why* it was built the way it was.

This is deliberately separate from `docs/*.md` at the level above, which is the
**pre-build spec** — a planning artifact written before any code existed. Where the two
disagree, the code and this folder win. Divergences are called out explicitly in
[10-known-gaps.md](10-known-gaps.md).

## What the app is

A private web app for a friend group ("Fake Clan") to track their League of Legends
Solo/Duo ranked games on the LAS server — nine tracked accounts at the time of writing. It
syncs match and rank data from Riot's API once a day, stores it in Postgres, and renders
dashboards, per-player pages, champion tierlists, cross-player insights, scrim and draft
preparation, and AI-written recaps.

Since Phase 17 it also serves **`/demo`**: a public, read-only, identity-stripped mirror of
the whole app, built so a hiring staff could look at the tool without being given logins.
The anonymization lives in Postgres, not in the render layer — [04, §10](04-auth-and-security.md)
is the section to read on that, and it is the most security-sensitive part of the codebase.

It runs entirely on free tiers: Vercel Hobby, Supabase Free, a Riot *personal* API key,
and the Gemini free tier. **Almost every interesting decision in this codebase traces
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
| 04 | [Auth & security](04-auth-and-security.md) | Five Supabase clients, RLS, column grants, login flow, the public demo |
| 05 | [Stats & domain logic](05-stats-and-domain-logic.md) | The pure-function layer, aggregation conventions, rank math |
| 06 | [AI layer](06-ai-layer.md) | Gemini, quota economics, prompt construction, error taxonomy |
| 07 | [Frontend](07-frontend.md) | App Router structure, RSC data fetching, design tokens, charts |
| 08 | [Operations](08-operations.md) | Env vars, deploys, cron, runbook, what breaks first |
| 09 | [Decision log](09-decision-log.md) | The load-bearing decisions (ADR-001 to ADR-040), with context and consequences |
| 10 | [Known gaps](10-known-gaps.md) | What's missing, what's stale, what would break at 10× scale |

## Conventions used in these docs

- File references are repo-relative and clickable: `src/lib/sync.ts:318`.
- "The walk" always means the backwards traversal of a player's match history in
  `syncPlayerMatches`.
- "Tracked player" means a row in `players` — someone in the friend group. The other
  nine participants in any given match are "untracked".
- "The batch" always means `/api/summaries`, the once-daily AI generation run.
- "The demo" means the public `/demo` subtree and the `demo_*` views behind it. "The
  private app" is everything else — the `(app)` route group and the base tables.

## The one-paragraph version

A Vercel Cron job hits `/api/sync` once a day. That route claims a lock on a singleton
`sync_state` row, then walks each tracked player's Riot match history backwards from
newest, inserting any match it hasn't seen along with all ten participants' stats, and
stops when it reaches a point it can prove is already covered. Every Riot call goes
through a sliding-window rate limiter, and the whole run is bounded by a wall-clock
deadline well short of Vercel's 60-second function ceiling — an interrupted run is
normal and resumable, not an error. An hour later a second cron hits `/api/summaries`,
which asks Gemini to write recaps for whichever players' data actually changed. Every
page is a React Server Component that reads Postgres directly through Supabase with RLS
enforced, aggregates in JavaScript, and renders. There is no client-side data fetching
anywhere except the sync button and the login form. The same page components render again
under `/demo` for anyone with the link, reading a set of Postgres views that expose the
same columns with every identity replaced and every free-text field withheld unless
somebody explicitly wrote a replacement for it.
