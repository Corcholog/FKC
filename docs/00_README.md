# Fake Clan SoloQ Tracker — Documentation Package

This is the full spec for your League of Legends SoloQ tracker, written so you (or Claude, via Claude Code / Claude Pro) can build the project from these files without needing another planning pass first.

## How to use this with Claude Code

1. Create a new empty repo/folder for the project.
2. Drop all these files into a `/docs` folder at the root.
3. Start Claude Code in that folder and point it at `06_ROADMAP.md` first — that's the build order. Something like: *"Read all the docs in /docs, then let's start with Phase 0 of the roadmap."*
4. Work phase by phase. Each phase in the roadmap references the doc(s) it needs.

## File index

| File | What it's for |
|---|---|
| `01_PRD.md` | What you're building — every feature, page, and requirement, MVP and future. Read this first. |
| `02_ARCHITECTURE.md` | The tech stack and how the pieces talk to each other. |
| `03_DATABASE_SCHEMA.md` | The Supabase/Postgres tables, explained. |
| `schema.sql` | The actual SQL to run in Supabase's SQL editor — creates every table in one shot. |
| `04_RIOT_API_INTEGRATION.md` | Riot API specifics: routing, endpoints, rate limits, the incremental-sync logic, and how to correctly exclude remakes/early surrenders. This is the trickiest part of the project — read it carefully before writing the sync code. |
| `05_DESIGN_SYSTEM.md` | Colour palette (actual hex values), typography, and component notes. |
| `06_ROADMAP.md` | The build order, phase by phase. |

## Decisions already made for you

To keep this buildable without back-and-forth, I made a few reasonable calls where your brief left room. They're all flagged inline in the relevant doc, but the big ones:

- **Stack:** Next.js (App Router) + TypeScript + Tailwind, on Vercel. This is the natural fit for "Vercel + admin page + cron + API routes" and it's what Claude Code will be most fluent in.
- **Auth (MVP):** one shared Supabase Auth login for the whole group, exactly as you described. The schema leaves room to move to per-player accounts later (needed for the private-chat feature).
- **Remake/early-surrender filtering:** Riot's match data actually has an explicit flag for this (`gameEndedInEarlySurrender`) — you don't need to hand-roll duration math. Details in `04_RIOT_API_INTEGRATION.md`.
- **Riot API key storage:** stored in a Supabase table instead of a Vercel env var, so refreshing the (24-hour-expiring) dev key doesn't require a redeploy. Explained in `02_ARCHITECTURE.md`.
- **Tracking start date:** July 29, 2026. Worth knowing — this is a mid-year "season" content update, not a ranked reset, so LP won't drop; you're just choosing this as your tracker's start line, and that's fine.

## Things to confirm before/while building

- **Riot API key type:** you'll register a *personal* API key (not a production key) with Riot — that's the correct and only option for a small private group like this, and it's explicitly what Riot's terms intend it for. It expires every 24h and needs manual renewal from the [Riot Developer Portal](https://developer.riotgames.com/).
- **Gemini model name:** model names/free-tier availability shift often. When you get to that phase, check [ai.google.dev/pricing](https://ai.google.dev/pricing) for the current free-tier Flash model ID rather than trusting a hardcoded name from these docs.
- **Exact palette hex values** in `05_DESIGN_SYSTEM.md` are a proposal based on your "blue/navy/dark blue/white/black/grey" brief — tweak freely, everything's defined as CSS variables so it's a one-place change.
