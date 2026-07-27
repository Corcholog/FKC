# Build Roadmap — Fake Clan SoloQ Tracker

A suggested phase order for working through this with Claude Code. Each phase is meant to leave you with something runnable/testable before moving on — don't build the whole data layer before you've seen a single real page render.

## Phase 0 — Setup
- Create the Supabase project (free tier). Run `schema.sql` in the SQL editor.
- Create the single shared login: Supabase dashboard → Authentication → Users → Add User (email + password).
- Register a personal Riot API key at the [Riot Developer Portal](https://developer.riotgames.com/).
- Create the Gemini API key (check current free-tier model name at ai.google.dev/pricing at this point, not from memory).
- Create the Next.js project, push to a repo, connect it to Vercel.
- Wire up environment variables per `02_ARCHITECTURE.md` §7.

## Phase 1 — Auth + Shell
- Login page using Supabase Auth (`signInWithPassword`), session persisted via cookies.
- Basic app shell: navbar (logo, placeholder sync button), route protection so every other page requires a session.
- This is small on purpose — everything else in the app sits behind it, so get it working first.

## Phase 2 — Admin Page + Player CRUD
- Add/edit/remove tracked players: Riot ID input → resolve to `puuid` via Account-V1 (see `04_RIOT_API_INTEGRATION.md` §2) → store in `players`.
- Avatar upload to Supabase Storage, `avatar_url` saved on the player row.
- At this point you should be able to add your actual friend group as real rows in the database.

## Phase 3 — Sync Engine
- Build `/api/sync` following `04_RIOT_API_INTEGRATION.md` end to end: incremental match fetch, remake/early-surrender filtering, rank refresh.
- Wire the navbar's sync button to call it directly.
- Add the `vercel.json` cron entry.
- This is the phase most worth testing carefully — run it manually a few times against real accounts before trusting the cron to run it unattended. Check that re-running it doesn't create duplicate matches (the `unique` constraints in `schema.sql` will loudly reject duplicates if the incremental logic has a bug — that's a feature, not an annoyance, while you're testing).

## Phase 4 — Home Page
- Render the roster from `players`, sorted by rank/LP.
- Rank badge, LP, W/L, winrate — all straight reads from the cached columns, no live Riot calls needed here.

## Phase 5 — Player Detail + Match History
- Match history list, newest first, reading from `matches` + `match_participants` joined on `player_id`.
- Champion icons via DDragon (§6 of the Riot doc).
- Match detail view: full 10-player ally/enemy breakdown.

## Phase 6 — Notes
- Add/edit/delete notes on a `match_participant` row.
- Simple inline UI on the match history/detail view — no separate notes page needed.

## Phase 7 — Riot Key Expiry Handling
- Wrap Riot calls in the sync job to catch 401/403 and flip `sync_state.riot_key_valid`.
- Navbar reads that flag and shows the popup/banner when false.
- Decide where the key itself lives (Supabase table vs. Vercel env var — `02_ARCHITECTURE.md` §4) and build the small settings UI for updating it if you went with the database option.

## Phase 8 — AI Summaries
- `/api/summary` route: pull a player's notes + aggregate stats, call Gemini, store the result in `player_ai_summaries`.
- Mark `stale = true` from the sync job (new matches) and from the notes routes (note added/edited/deleted).
- Wire the player detail page to trigger/display it per the lazy-vs-eager decision in `02_ARCHITECTURE.md` §6.

## Phase 9 (MVP done) — Polish
- Empty states (no players yet, player with no matches yet).
- Loading states for the sync button specifically — it's the one action in the app that takes a visible amount of time.
- Mobile pass, if the group will check this from phones during/after games.

---

## Future Phases (post-MVP, in your stated priority order)

### Phase 10 — Champion Tierlist per Player
Pure reporting on data you already have — aggregate `match_participants` by `player_id` + `champion_id` (games played, wins, avg KDA/CS/gold). No new external calls needed; this is the cheapest future feature to build relative to how it looks.

### Phase 11 — Private AI Chat per Player
The one feature that changes the auth model. Before starting this phase:
- Add one `auth.users` row per real player (moving off the single shared login for this feature specifically — the rest of the app's shared-login model doesn't need to change).
- Add `user_id` to `players`, linking each player to their own auth account.
- New chat table(s) with RLS scoped to `auth.uid()` matching that player's `user_id` (see `02_ARCHITECTURE.md` §5 for the exact policy shape).
- Everything else (matches, notes, tierlist) can stay group-visible under the existing shared policy — only the chat itself needs to be private per person.
