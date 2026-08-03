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
| AI | Gemini API (free tier) | Metered per day, which is the single constraint that shaped the whole AI design. |
| Charts | Recharts 3 | The LP chart and tilt curve. The heatmap and duo matrix are plain CSS grid — see [07](07-frontend.md). |

## 2. Topology

```
   ┌────────────────────┐        ┌────────────────────┐
   │  Vercel Cron       │        │  Vercel Cron       │
   │  0 10 * * *  (UTC) │        │  0 11 * * *  (UTC) │
   │  = 07:00 Buenos As │        │  = 08:00 Buenos As │
   └─────────┬──────────┘        └─────────┬──────────┘
             │ GET /api/sync                │ GET /api/summaries
             │ Bearer CRON_SECRET           │ Bearer CRON_SECRET
             ▼                              ▼
   ┌──────────────────────┐       ┌──────────────────────┐
   │ /api/sync            │       │ /api/summaries       │
   │ maxDuration = 60     │       │ maxDuration = 60     │
   │ • claims sync_state  │       │ • loads AI context   │
   │ • runSync()          │       │ • team recap first   │
   │ • records outcome    │       │ • stale players next │
   └────┬─────────┬───────┘       └────┬─────────────┬───┘
        │         │                    │             │
        │  ┌──────▼──────┐             │      ┌──────▼──────┐
        │  │ Riot API    │             │      │ Gemini API  │
        │  │ americas +  │             │      │ (free tier) │
        │  │ la2         │             │      └─────────────┘
        │  └─────────────┘             │
        │                              │
        ▼        service role          ▼
   ┌──────────────────────────────────────────────┐
   │            Supabase Postgres                  │
   │  players · matches · match_participants ·     │
   │  player_rank_history · match_notes ·          │
   │  player_ai_summaries · team_ai_summary ·      │
   │  clan_profile · sync_state                    │
   │  + Storage bucket: avatars                    │
   └───────────────────▲──────────────────────────┘
                       │ anon key, RLS enforced
                       │
   ┌───────────────────┴──────────────────────────┐
   │  Next.js Server Components (every page)       │
   │  src/proxy.ts gates every request first       │
   └───────────────────▲──────────────────────────┘
                       │ champion icons
                       │
              ┌────────┴─────────┐
              │  DDragon CDN     │
              │  (24h revalidate)│
              └──────────────────┘
```

Note the two arrows into Postgres. **The sync and the AI batch write with the service
role key (RLS bypassed); every page reads with the publishable key (RLS enforced).**
That split is the whole security model and is covered in [04](04-auth-and-security.md).

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
3. **`src/app/(app)/player/[slug]/page.tsx`** runs as a Server Component. It fires one
   `Promise.all` of five independent queries, then two dependent follow-ups once match
   IDs are known, aggregates everything in JavaScript, and returns JSX.
4. Client components (`LpChart`, `HourHeatmap`, `MatchupList`, `NotesSection`) receive
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
│   ├── login/page.tsx          The one public route
│   ├── (app)/                  Route group: everything behind auth
│   │   ├── layout.tsx          Navbar + key-expired banner
│   │   ├── page.tsx            Dashboard (awards, activity, squad, team recap)
│   │   ├── team/               Roster grid
│   │   ├── matches/            Full match history, filterable by player
│   │   ├── champions/          Per-player champion tierlist
│   │   ├── insights/           Cross-player: LP race, duos, tilt, heatmap
│   │   ├── player/[slug]/      Player detail: LP, champions, roles, recent form
│   │   ├── notes/              Note CRUD server actions (no page.tsx, no route)
│   │   ├── settings/           Roster CRUD, Riot key, AI context, logins
│   │   └── account/            Password change for the signed-in player
│   └── api/
│       ├── sync/route.ts       The daily sync (also the navbar button)
│       └── summaries/route.ts  The daily AI batch
├── lib/
│   ├── supabase/               Four clients: browser, server, admin, proxy
│   ├── riot.ts                 Riot HTTP client + DTO types + field whitelists
│   ├── rate-limiter.ts         Sliding-window limiter (shared by Riot and Gemini)
│   ├── sync.ts                 The sync engine — the densest file in the repo
│   ├── participant-row.ts      Riot DTO → database row mapping
│   ├── ddragon.ts              Champion id ↔ display name ↔ icon URL
│   ├── auth.ts                 Session helpers (React `cache`-deduped)
│   ├── {player,champion,duo,time}-stats.ts, sessions.ts, streaks.ts, matchups.ts
│   │                           The pure-function domain layer — no I/O
│   ├── rank.ts                 Tier/division/LP ↔ sortable & plottable numbers
│   ├── gemini.ts, summary.ts, ai-context.ts    The AI layer
│   └── roles.ts, format.ts, slug.ts, lolalytics.ts, utils.ts
└── components/
    ├── ui/                     shadcn primitives (Base UI under the hood)
    ├── charts/                 Recharts wrappers + the shared chart palette
    ├── settings/, player/, insights/, account/
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
volume (five players × a few hundred games) that's a few thousand rows and it's fine.
It is also the first thing that would need to change at scale — see
[10](10-known-gaps.md).

**Writes go through Server Actions, not API routes.** The two API routes exist only
because they need `maxDuration = 60` and an unauthenticated cron entry point. Everything
else — adding a player, writing a note, editing AI context — is a `"use server"`
function returning a `PlayerFormState`/`NoteFormState` consumed by `useActionState`.
