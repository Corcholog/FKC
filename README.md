# Fake Clan SoloQ Tracker

Private web app for tracking a small group's League of Legends Solo/Duo ranked games on LAS. Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres + Auth), Vercel, Riot Games API, Gemini.

Not a public product — everything here sits behind a login for one private friend group. There's no signup: a shared viewer account reads everything, and each roster player gets their own account (created from the Settings page) so they can write notes on their own games.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in the values, see below
npm run dev
```

### Environment variables

See [.env.local.example](.env.local.example) for the full list and where each value comes from (Supabase project settings, ai.google.dev). The Riot API key is **not** an env var — it's stored in Supabase's `sync_state` table instead, since a personal dev key expires every 24h and this avoids a redeploy each time it's refreshed.

### Database

Run the schema SQL against a fresh Supabase project's SQL Editor before first use. For an existing project, run the numbered files in `docs/migrations/` instead. (Both kept locally, not in this repo — ask if you need them re-shared.)

## Status

Every roadmap phase in `docs/06_ROADMAP.md` is shipped: the MVP (Phases 0–9), the per-player champion tierlist (10), per-player accounts with owned notes (11), insights (12), and the team recap with editable prompt context (13). Phase 14, private per-player AI chat, has been **cut** — the AI stays one-way and group-visible. See commit history for progress.
