# Architecture — Fake Clan SoloQ Tracker

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14+ (App Router), TypeScript | Native Vercel deployment, API routes double as your sync/cron/admin endpoints, one repo for frontend+backend |
| Styling | Tailwind CSS | Fast to hand to Claude Code, pairs well with a token-based color palette (see `05_DESIGN_SYSTEM.md`) |
| Database | Supabase Postgres (free tier) | Free, relational (this data is inherently relational: players → matches → participants → notes), built-in Auth |
| Auth | Supabase Auth | One shared login for MVP; same system extends cleanly to per-player accounts later |
| Hosting | Vercel (Hobby/free tier) | You already specified this |
| Scheduling | Vercel Cron (`vercel.json`) | Built in, free, sufficient for once-daily |
| External data | Riot Games API (personal key) | Match/rank data |
| Icons | Data Dragon (DDragon) CDN | Official, free, no auth needed |
| AI | Gemini API (free tier) | You already specified this |

## 2. High-Level Flow

```
                      ┌─────────────────────┐
                      │   Vercel Cron        │  (daily, ~10:00 UTC
                      │   (vercel.json)      │   = 07:00 Buenos Aires)
                      └──────────┬───────────┘
                                 │ GET /api/sync
                                 ▼
   ┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐
   │  Navbar       │ ───▶ │  /api/sync        │ ───▶ │  Riot Games API   │
   │ "Sync now"    │      │  (Next.js route)  │◀──── │  (match/league)   │
   └──────────────┘      └────────┬──────────┘      └──────────────────┘
                                   │ writes
                                   ▼
                          ┌──────────────────┐
                          │ Supabase Postgres │
                          │ (players, matches,│
                          │  participants,     │
                          │  notes, sync_state)│
                          └────────┬──────────┘
                                   │ reads
                                   ▼
                    ┌──────────────────────────────┐
                    │ Next.js pages (home, player,  │
                    │ admin) — behind Supabase Auth │
                    └──────────────┬───────────────┘
                                   │ champion icons
                                   ▼
                          ┌──────────────────┐
                          │  DDragon CDN       │
                          └──────────────────┘

   Separately, whenever a player's matches/notes change:
   ┌──────────────────┐      ┌──────────────┐      ┌──────────────────┐
   │ Supabase (stale   │ ───▶ │ /api/summary  │ ───▶ │  Gemini API       │
   │ flag on player)   │      │  route        │◀──── │                   │
   └──────────────────┘      └──────┬───────┘      └──────────────────┘
                                     │ writes
                                     ▼
                            player_ai_summaries
```

## 3. The Sync Job (`/api/sync`)

One route, called two ways:
1. **Vercel Cron** hits it once a day (unauthenticated Vercel cron requests carry a distinctive user agent — additionally protect this route by checking a `CRON_SECRET` header/env var so it can't be triggered by randoms, even though the app is already private).
2. **The navbar button** calls it directly from the logged-in client, same route, no special-casing needed beyond normal auth.

Guard against overlapping runs: check `sync_state.last_sync_status`; if `'running'`, return early instead of starting a second sync.

Full per-player logic (Riot endpoints, incremental stop condition, remake filtering) is in `04_RIOT_API_INTEGRATION.md` — this doc only covers the plumbing around it.

### Vercel Cron config (`vercel.json`)
```json
{
  "crons": [
    {
      "path": "/api/sync",
      "schedule": "0 10 * * *"
    }
  ]
}
```
Buenos Aires is UTC-3 year-round (no daylight saving since 2009), so 07:00 local = 10:00 UTC. **Caveat:** on Vercel's free Hobby tier, cron jobs are limited to once per day and Vercel only guarantees the run happens *within that UTC hour*, not at the exact minute. For a daily sync that's totally fine — nobody's watching the clock for this. If you ever want tighter timing, a free external scheduler (e.g. cron-job.org) hitting the same route is a drop-in alternative that doesn't require a Vercel plan change.

**Side benefit:** this daily hit to Supabase also counts as project activity, which resets Supabase's free-tier "pause after 7 days of inactivity" timer — so as long as the cron runs, your database won't auto-pause between hangout sessions.

## 4. Riot API Key Handling

You'll register a **personal** Riot API key (not a production key — a production key requires Riot's approval for a public-facing product, which this explicitly isn't; Riot's terms only permit personal keys for exactly this kind of small private-community use). Two real constraints follow from that:

- **It expires every 24 hours** and has to be manually regenerated from the [Riot Developer Portal](https://developer.riotgames.com/), then updated in your app.
- **Rate limits:** 20 requests/second, 100 requests/2 minutes, enforced per-region. Comfortably enough for a handful of friends synced once a day — see `04_RIOT_API_INTEGRATION.md` for the actual math.

**Recommendation: store the key in a Supabase table (e.g. a column on your `sync_state` singleton row, or an `app_config` key/value table), not as a Vercel environment variable.** A Vercel env var requires a redeploy to change — annoying for something you'll be updating daily. Reading it from the database means you can update it from the admin page (§4.5 in the PRD) with no redeploy. The tradeoff is that it's a bit less "secret" than an env var (it's sitting in your DB rather than Vercel's encrypted env store) — acceptable here since the whole app is already private and the key itself is low-stakes (rate-limited, personal, no billing attached). If that tradeoff bothers you, the alternative is a Vercel env var updated via the Vercel dashboard or CLI each time it expires — same expiry problem, just a different place to paste the new key.

**Detecting expiry (drives the navbar popup in PRD §4.1):** wrap every Riot API call; if a response comes back `401` or `403`, immediately set `sync_state.riot_key_valid = false` and stop the current sync run rather than continuing to burn through calls that will all fail the same way. The frontend reads this flag (a small `/api/sync-status` route, or a direct Supabase read with RLS since the user is already authenticated) on page load and shows the popup/banner if it's `false`. Once someone updates the key, flip it back to `true` on the next successful sync.

## 5. Auth Model

**MVP:** a single row in Supabase's `auth.users`, created once via the Supabase dashboard (Authentication → Users → Add User) rather than through a signup form — there is no signup flow in this app. The frontend uses `supabase-js`'s `signInWithPassword` against that one account. Every page/route in the app checks for a valid session and redirects to login if absent.

Row Level Security (RLS): enabled on every table, with a simple `USING (auth.role() = 'authenticated')` policy — since there's only one account, "authenticated" and "a member of the group" are the same thing in the MVP. Details/policy SQL in `03_DATABASE_SCHEMA.md`.

**Future (private AI chat, PRD §6):** this is the one feature that needs a real multi-user model. When you get there: create one `auth.users` row per player, add a `user_id` column to the `players` table linking the two, and tighten RLS on the new chat table(s) to `USING (auth.uid() = (SELECT user_id FROM players WHERE id = player_id))` so each player only sees their own chat. Everything else in the schema (matches, participants, notes) can stay on the shared/open policy, since those are meant to be group-visible.

## 6. AI Summary Generation Strategy

Two reasonable options — pick based on how much you want to think about Gemini's free-tier daily quota (it's model-dependent and changes over time; check current numbers before committing):

- **Eager:** at the end of every sync run, regenerate the summary for every player who got new matches, plus any player who had a note touched since the last summary. Simple mental model, but scales with (players × sync frequency), so worth keeping an eye on quota with even a small group.
- **Lazy (recommended to start):** mark a player's summary `stale = true` whenever their matches or notes change (in the sync job and in the notes API route). Only actually call Gemini the next time someone *opens that player's page* and the stored summary is stale. This means you never spend a Gemini call on a player nobody's currently looking at, which is the more free-tier-friendly default for a small friend group that won't check every profile every day.

Either way, store the result in `player_ai_summaries` (see schema) with a `generated_at` timestamp so the page can show "summary last updated: ..." for transparency.

## 7. Environment Variables (rough list — finalize during Phase 0 of the roadmap)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, used by `/api/sync` to write data bypassing RLS (never expose to the client)
- `GEMINI_API_KEY`
- `CRON_SECRET` — shared secret checked in `/api/sync` to confirm the call came from Vercel Cron or your own authenticated navbar action
- *(Riot API key deliberately not here — see §4 above)*
