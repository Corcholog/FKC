# 01 — System Overview

## 1. Stack, and why each piece

| Layer | Choice | Why this one |
|---|---|---|
| Framework | Next.js 16.2 (App Router), TypeScript | One deployable for both pages and the sync/cron endpoints. Server Components mean page code can query Postgres directly with no API layer in between. |
| Styling | Tailwind CSS v4 + shadcn/ui on Base UI | Token-driven, so the whole app re-themes from one `:root` block. v4 configures through CSS (`@theme inline`), not `tailwind.config.js`. |
| Database | Supabase Postgres (free) | The data is genuinely relational (players → matches → participants → notes). Free tier, and Auth comes with it. |
| Auth | Supabase Auth | Cookie sessions that work across Server Components, Server Actions, and Route Handlers via `@supabase/ssr`. |
| Hosting | Vercel Hobby | Free, and the cron scheduler is built in. |
| Scheduling | Vercel Cron (`vercel.json`) | Two daily jobs. Hobby caps *frequency* at once/day, not job count. |
| Match data | Riot Games API (personal key) | The only source. Personal keys expire every 24h — see §4. |
| Champion art | Data Dragon CDN | Free, no auth, versioned per patch. No image assets in the repo. |
| Charts | Recharts 3 | One survival curve, for game length. The hour bars are plain CSS — see [07](07-frontend.md). |

## 2. Topology

```
   ┌────────────────────┐        ┌────────────────────┐
   │  Vercel Cron       │        │  Vercel Cron       │
   │  0 10 * * *  (UTC) │        │  0 23 * * 0  (UTC) │
   │  = 07:00 Buenos As │        │  Sunday wrap       │
   └─────────┬──────────┘        └─────────┬──────────┘
             │ GET /api/sync                │ GET /api/weekly
             │ Bearer CRON_SECRET           │ Bearer CRON_SECRET
             ▼                              ▼
   ┌──────────────────────┐       ┌──────────────────────┐
   │ /api/sync            │       │ /api/weekly          │
   │ maxDuration = 60     │       │ • the week's record  │
   │ • claims sync_state  │       │ • standings          │
   │ • runSync()          │       │ • posts to Discord   │
   │ • records outcome    │       │                      │
   └────┬─────────┬───────┘       └────┬─────────────────┘
        │         │                    │
        │  ┌──────▼──────┐             │
        │  │ Riot API    │             │
        │  │ americas +  │             │
        │  │ la2         │             │
        │  └─────────────┘             │
        │                              │
        ▼        service role          ▼
   ┌──────────────────────────────────────────────┐
   │            Supabase Postgres                  │
   │  players · player_accounts · matches ·        │
   │  match_participants (+ queue views) ·         │
   │  player_rank_history · match_notes ·          │
   │  sync_state · team_* ·                        │
   │  draft_* · champion_*                         │
   │  + Storage bucket: avatars                    │
   └────────▲──────────────────────────────────────┘
            │ publishable key
            │ session JWT
            │ RLS enforced
            │
   ┌────────┴───────────────┐
   │ (app) Server Components│
   │ src/proxy.ts gates them│
   └────────▲───────────────┘
            │ champion icons
            └───────┬──────────
              ┌─────┴────────────┐
              │  DDragon CDN     │
              │  (24h revalidate)│
              └──────────────────┘
```

Note the two arrows into Postgres. **The sync writes with the service role key (RLS
bypassed); every page reads with the publishable key and the visitor's session (RLS
enforced).** There used to be a third — a session-less `anon` client for the public
demo, reading `demo_*` views that RLS denied on the base tables. That was the whole point of
the security model in [04](04-auth-and-security.md); the demo is gone (ADR-050) and what is
left is one door with a session in front of it.

## 3. Request lifecycle for a page view

Take `/player/some-guy-las` as the example.

1. **`src/proxy.ts`** runs first. In Next.js 16, Middleware was renamed **Proxy** — one
   `proxy.ts` at the `src/` root, same functionality. It delegates to
   `updateSession()` in `src/lib/supabase/middleware.ts:6`, which:
   - builds a server client wired to the request/response cookie jars,
   - calls `supabase.auth.getUser()` — **not** `getSession()`, because `getUser()`
     revalidates the token against Supabase rather than trusting the cookie, which is
     what actually refreshes an expiring session,
   - lets `/api/*` straight through (those routes do their own auth and must return
     JSON, not an HTML redirect),
   - redirects signed-out users to `/login`, and signed-in users away from it.
2. **`src/app/(app)/layout.tsx`** renders. It fetches the sync state, the session, the
   DDragon version and champion list, and (for a linked player) their most-played lane —
   all concurrently — then renders the navbar and the key-expired banner.
3. **`src/app/(app)/players/[slug]/page.tsx`** runs as a Server Component. It fires one
   `Promise.all` of independent queries, then dependent follow-ups once match IDs are
   known, aggregates everything in JavaScript — once per account, so the account filter
   needs no server — and returns JSX.
4. Client components (`HourBars`, `MatchupList`, `AccountFilter`, `NotesSection`) receive
   plain serializable props. **No client component fetches data.**

The only two places the browser talks to a backend directly are the login form
(`supabase.auth.signInWithPassword` + an RPC) and the navbar's Sync button
(`fetch("/api/sync")`).

## 4. The Riot key lives in the database, not in env

This is the first decision that surprises people, so it's worth stating up front.

A Riot **personal** API key expires every 24 hours. If it were a Vercel environment
variable, refreshing it would mean an env var edit plus a redeploy, every single day. So
it lives in `sync_state.riot_api_key` and is updated from the Settings page.

Consequences, all deliberate:
- `loadApiKey()` (`src/lib/sync.ts:80`) reads it at the start of every run and throws a
  clear error if it's missing.
- A 401/403 from Riot is translated to `RiotKeyInvalidError` (`src/lib/sync.ts:528`),
  which flips `sync_state.riot_key_valid = false`, which the layout reads and renders as
  a banner across every page.
- The key sits in a table that any authenticated user can read. That is an accepted
  tradeoff for a private app with a hand-created roster of logins — see
  [09, ADR-002](09-decision-log.md).

## 5. Where the code lives

```
src/
├── proxy.ts                    Next 16 Proxy (ex-Middleware): auth gate on every request
├── app/
│   ├── layout.tsx              Root: fonts (Geist + Rajdhani), Toaster
│   ├── globals.css             The entire design system — tokens + shadcn mapping
│   ├── login/page.tsx          Public route
│   ├── robots.ts               noindex, everything — nothing here is public
│   ├── (app)/                  Route group: everything behind auth
│   │   ├── layout.tsx          Navbar + key-expired banner
│   │   ├── page.tsx            The team: roster board, record, recent series
│   │   ├── soloq/              The soloQ awards — hall of fame and shame
│   │   ├── matches/            Every game under one filter, plus the series
│   │   │                       entry form and one series' detail
│   │   ├── players/            The five; [slug] is one of them in depth
│   │   ├── prep/               Draft board, champion notes, counters, comps,
│   │   │                       tier lists, scouting, pick/bans, opponents
│   │   ├── notes/              Note CRUD server actions (no page.tsx, no route)
│   │   ├── settings/           Roster CRUD, Riot key, sync controls, logins
│   │   └── account/            Password change for the signed-in player
│   └── api/
│       ├── sync/route.ts       The daily sync (also the navbar button)
│       └── weekly/route.ts     The weekly Discord recap
├── lib/
│   ├── supabase/               Four clients: browser, server, proxy, admin
│   ├── data-source.ts          `DataSource` — which set of tables a read goes to
│   ├── loaders/                One loader per page: fetchXRows (plain arrays) +
│   │                           buildX (a pure fold, no I/O)
│   ├── riot.ts                 Riot HTTP client + DTO types + field whitelists
│   ├── rate-limiter.ts         Sliding-window limiter for the Riot client
│   ├── sync.ts                 The sync engine — the densest file in the repo
│   ├── queues.ts               Which queues are tracked, from when, and where
│   │                           each one's cursor lives
│   ├── scope.ts, unified.ts    Which sources a page counts, and the one row
│   │                           shape that lets the aggregators mix them
│   ├── team/roster.ts          Role order, and whether a Riot game was the team's
│   ├── settings/helpers.ts     The non-action half of the settings writes
│   ├── participant-row.ts      Riot DTO → database row mapping
│   ├── ddragon.ts              Champion id ↔ display name ↔ icon URL
│   ├── auth.ts                 Session helpers (React `cache`-deduped)
│   ├── {player,champion,duo,time,duration,side}-stats.ts, lane-diff.ts,
│   │   sessions.ts, streaks.ts, matchups.ts
│   │                           The pure-function domain layer — no I/O
│   ├── rank.ts                 Tier/division/LP ↔ sortable & plottable numbers
│   └── roles.ts, format.ts, slug.ts, lolalytics.ts, utils.ts
└── components/
    ├── ui/                     shadcn primitives (Base UI under the hood)
    ├── charts/                 Recharts wrappers + the shared chart palette
    ├── settings/, player/, players/, matches/, prep/, account/
    ├── team/views/             The body of each team-game page, minus its writes
    └── (top level)             match-row, award-tile, stat-ranking, navbar, …
```

## 6. The architectural shape, in one sentence each

**There is no service layer.** Pages query Supabase directly. The thing that keeps this
from becoming a mess is that all *computation* is extracted into pure functions in
`src/lib/*-stats.ts` that take plain rows and return plain aggregates. Pages fetch and
render; libs compute. That split is the single most important structural convention in
the codebase, and it's why the same aggregation code backs the dashboard tiles, the
player page, and the AI prompts without drifting.

**Aggregation happens in JavaScript, not in Postgres.** Every stats page selects all
relevant `match_participants` rows unbounded and folds them in memory. At this roster's
volume (nine tracked players × a few hundred games) that's a few thousand rows and it's fine.
It is also the first thing that would need to change at scale — see
[10](10-known-gaps.md).

**Writes go through Server Actions, not API routes.** The API routes exist only because
they need `maxDuration = 60` and either a cron entry point or a budget longer than an
action should hold. Everything else — adding a player, writing a note, linking an account
— is a `"use server"` function returning a `PlayerFormState`/`NoteFormState` consumed by
`useActionState`.

**A page reads one queue because of which source it was handed.** A loader in
`src/lib/loaders/` takes a `DataSource` and calls `source.table("match_participants")`,
which resolves to `soloq_participants`, `flex_participants` or `ranked_participants`. No
loader writes `.eq("queue_id", 420)`, which is the point: a forgotten queue filter produces
a plausible wrong number rather than an error. See [07 §14](07-frontend.md).

This used to be two axes — the second swapped every table for its `demo_` view so one
loader served the private app and the public demo. That half went with the demo (ADR-050);
the queue half is the one that was still earning its keep.
