# Product Requirements Document — Fake Clan SoloQ Tracker

## 1. Purpose

A private web app for a small group of friends ("Fake Clan") to track their League of Legends Solo/Duo ranked games on the LAS server, starting from July 29, 2026. It shows current rank and recent performance for the whole group at a glance, lets anyone drill into a specific player's match history, and lets the group leave review notes on their own games. An AI assistant summarizes each player's notes and stats into a running narrative.

This is not a public product. It is built and run entirely on free tiers (Vercel + Supabase + a personal Riot API key + Gemini free tier), for one private group.

## 2. Users & Access

- **MVP:** one shared login (single username/password pair) for the entire group. Anyone with the login can view all data and add notes to any match. There is no per-person identity inside the app in the MVP — it's a shared space, matching how the group already operates.
- **Future (see §6):** per-player accounts, needed once the private AI chat feature is added.

## 3. Tech Stack (summary — full detail in `02_ARCHITECTURE.md`)

- Frontend/backend: Next.js (App Router), TypeScript, Tailwind CSS
- Database/Auth: Supabase (Postgres + Supabase Auth), free tier
- Hosting: Vercel, free (Hobby) tier
- External data: Riot Games API (personal key), Data Dragon (DDragon) CDN for champion icons
- AI: Gemini API (free tier)

## 4. MVP Scope

### 4.1 Navbar
- Present on every page (once logged in).
- Fake Clan icon/logo.
- **Manual sync button** — triggers the same sync job the daily cron runs, on demand. Disabled/shows a spinner while a sync is already running.
- **Riot API key status** — if the stored Riot API key has expired or is otherwise rejected by Riot (401/403), show a popup/banner alerting the group that the key needs to be refreshed, with a link to where it's updated (see `02_ARCHITECTURE.md` §Riot API Key Handling).

### 4.2 Login
- Single shared account, created ahead of time directly in Supabase (dashboard or SQL) — not self-service signup.
- Standard email/password sign-in via Supabase Auth. Session persists (cookie-based), no need to log in every visit.
- Everything else in the app sits behind this login.

### 4.3 Home Page
For every tracked player, display:
- Riot ID (game name + tag line) / display name
- Avatar (the player's uploaded photo)
- Current rank (tier + division, e.g. "Gold II") and League Points (LP)
- Win/loss record for the tracked period (wins, losses, and win rate %)
- Formatted as **W/L**, per your spec (e.g. "42W / 31L")

Sorted by rank/LP descending by default. Each row/card links to that player's detail page.

### 4.4 Player Detail Page
- Header: same summary as the home page card for this player (rank, LP, W/L, winrate).
- **Match history list** — every tracked SoloQ game for this player, newest first. Each entry shows: result (W/L), champion played (icon via DDragon), KDA, damage, gold, CS, game duration, date.
- Clicking into a specific match shows the **full 10-player breakdown** — every ally and enemy in that game, with their champion, kills/deaths/assists, damage, gold, and CS. (This data is fetched and stored for every game regardless of whose page you're viewing — see §4.6.)
- **Notes** — anyone (shared login, so effectively "anyone in the group") can add a free-text note to any of that player's matches — e.g. "died overextending at 14 min, should've backed." Notes are editable/deletable. No approval workflow, no author restriction beyond being logged in.
- **AI Summary** — a running natural-language summary generated from this player's notes + match stats (see §4.7), shown near the top of the page.

### 4.5 Admin Page
- Only reachable when logged in (same shared login — no separate admin role in MVP).
- Add a new tracked player: input their Riot ID (game name + tag line), platform (defaults to LA2/LAS), upload/assign an avatar photo, pick a display name.
- Edit or remove a tracked player.
- (Optional, nice-to-have if time allows) view/update the stored Riot API key here, and see last-sync status/timestamp — pairs with the navbar popup in §4.1.

### 4.6 Data Sync Engine
- Pulls each tracked player's recent ranked Solo/Duo (queue 420) matches from the Riot API.
- Runs automatically once a day, targeting **7:00 AM America/Argentina/Buenos Aires time**, and can also be triggered manually from the navbar.
- **Must be incremental**: stop fetching a player's match history as soon as it reaches a match ID already stored in the database, since Riot returns matches newest-first. Never re-fetch a match already in the database. Full mechanics in `04_RIOT_API_INTEGRATION.md`.
- **Excludes remakes and early surrenders (before 15 minutes)** — a game that ended this way has no "win" or "loss" and shouldn't count. Riot's match data has an explicit flag for this; exact logic in `04_RIOT_API_INTEGRATION.md`.
- For every valid game, stores full per-participant data for **all 10 players** (both teams) — champion, KDA, damage to champions, gold earned, CS, plus the game's duration and result — not just the tracked player's own line. This is what powers the "allies and enemies" breakdown in §4.4.
- Also refreshes each tracked player's current rank/LP/W-L snapshot on every sync.
- Only tracks games played from **July 29, 2026** onward (the app's stated start date) — earlier history is out of scope.

### 4.7 AI Match/Notes Summary (Gemini)
- For each tracked player, a background job generates a natural-language summary using: that player's notes across their matches, plus their aggregate stats (recent results, champion performance, KDA/CS/gold trends).
- **Re-generates whenever the input changes** — i.e., whenever that player gets a new synced match, or a note on one of their matches is added/edited/deleted. (Exact trigger strategy — eager vs. lazy — is in `02_ARCHITECTURE.md`, since it affects free-tier quota usage.)
- Shown on the player detail page (§4.4).

## 5. Non-Functional Requirements

- **Cost:** must run entirely on free tiers — Vercel Hobby, Supabase Free, Riot personal API key, Gemini free tier. The architecture doc flags the specific free-tier ceilings that matter here (Supabase's 500MB DB / 7-day pause-on-inactivity, Vercel's once-daily cron on Hobby, Riot's 20 req/s & 100 req/2min personal-key limits, Gemini's daily request caps).
- **Privacy:** the whole app sits behind login. Nothing here needs to be indexable or public.
- **Champion art:** sourced live from DDragon CDN by champion ID — no local image assets needed, and it stays correct as new champions/skins ship.
- **Resilience to Riot API hiccups:** a failed sync (expired key, Riot downtime, rate-limit) should not corrupt existing data, and should be visible to the group via the navbar indicator rather than failing silently.

## 6. Future Features (explicitly out of scope for MVP)

Ordered as you specified, second-priority pair first:

1. **Champion tierlist per player** — aggregate stats (games, winrate, avg KDA) per champion per player, computed entirely from data already stored by the MVP sync engine. No new external API calls needed — this is essentially a reporting view on existing tables, which makes it a relatively light lift once the MVP is stable.
2. **Match-history AI summary** — note: you listed this alongside the tierlist as second priority, but it's specified as part of the MVP experience in your brief (§4.7 above already covers "AI summarizes notes + stats"). Treating it as MVP here; if you'd rather defer the *AI* summary specifically and ship notes-taking without it first, that's a one-phase reorder in `06_ROADMAP.md`, not a redesign.
3. **Private per-player chat with the AI agent** — requires moving from the single shared login to real per-player accounts (Supabase Auth with one `auth.users` row per player, linked to their `players` row), so chat history and context can be scoped per person via Row Level Security. This is the one future feature that changes the auth model, so it's called out specifically in `02_ARCHITECTURE.md` and `06_ROADMAP.md`.

## 7. Assumptions Made While Writing This Spec

- Team name/branding: "Fake Clan," using your existing icon and player photos — no new asset creation needed.
- Win/loss color coding: your palette brief is strictly blue/navy/dark blue/white/black/grey, so the design doc keeps to that (lighter blue = win, muted grey = loss) rather than the conventional green/red. Easy to change if you'd actually prefer green/red just for W/L indicators — flagged again in `05_DESIGN_SYSTEM.md`.
- "Anyone can add notes" is implemented without per-author attribution by default (since login is shared), with an optional free-text "name" field on each note as a nice-to-have so you can still tell who wrote what without building real multi-user auth in the MVP.
