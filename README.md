# Fake Clan SoloQ Tracker

A League of Legends performance tracker for a nine-account roster on LAS — Solo/Duo ranked
history, scrim and tournament drafts, and the analysis built on top of both.

Next.js 16 (App Router) + TypeScript + Tailwind v4, Supabase (Postgres + Auth), Vercel, Riot
Games API, Gemini. It runs entirely on free tiers, and **almost every interesting decision in
it traces back to a free-tier ceiling.**

## 👀 See it without an account

**[fkc-soloq.vercel.app/demo](https://fkc-soloq.vercel.app/demo)**

Real, current data from a live roster — every identity replaced. Read-only, no login, nothing
to sign up for. It's the same pages the private app renders, so it isn't a mockup and it
doesn't drift.

The anonymization lives in **Postgres, not in the rendering layer**. `demo_*` views project
the base tables with the identifying columns *absent* rather than filtered, and the public
role has read access to those views and to nothing else — so there is no line of code
somebody can forget. The demo's pages also hold a session-less Supabase client, which means
they run as `anon` even for a signed-in visitor. Three independent layers, each sufficient
alone; the reasoning is in
[docs/engineering/04-auth-and-security.md](docs/engineering/04-auth-and-security.md) §10.

Free text is the one thing a projection can't anonymize, so no note, no AI context and no
opponent nickname is exposed at all: the views read prose from a separate override table, and
a row nobody wrote an override for shows nothing. The default is silence, not leakage.

## The rest of it is private

There is no public signup. The app itself sits behind a login for one friend group: a shared
viewer account reads everything, and each roster player gets their own account (created from
Settings) so they can write notes on their own games.

## What it does

- **Solo/Duo tracking** — daily sync from Riot's API, rank history, per-player pages with
  champion pools, lane matchups, session tilt, hour heatmap, winrate by game length, lane
  differentials against the direct opponent, and map side.
- **Cross-player insights** — the LP race, duo synergy, civil wars, marathon sessions.
- **Champion tier lists**, hand-made per player, exportable as PNG.
- **Scrims** — hand-entered tournament and practice games with full drafts, threaded notes
  per game, per-opponent scouting, and a filtered team view that answers *"show me every game
  where we faced K'Sante and Maokai"*.
- **A draft simulator** with a contextual reference panel — your saved comps, synergies and
  counters, filtered by what's already on the board. It works on the demo too.
- **AI recaps** — a daily per-player summary and a team recap, written from precomputed
  splits so the model narrates numbers rather than inventing them.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in the values, see below
npm run dev
```

### Environment variables

See [.env.local.example](.env.local.example) for the full list and where each value comes from
(Supabase project settings, ai.google.dev). The Riot API key is **not** an env var — it lives
in Supabase's `sync_state` table, because a personal dev key expires every 24h and this avoids
a redeploy each time it's refreshed.

### Database

Run the schema SQL against a fresh Supabase project's SQL Editor before first use. For an
existing project, run the numbered files in `docs/migrations/` instead. (Both kept locally,
not in this repo — ask if you need them re-shared.)

Migrations 018–020 are the ones the public demo needs; each carries its own verification
block, and a warning that the demo views must keep `security_invoker` off — turning it on
returns zero rows **with no error**, because RLS denies by matching nothing rather than by
raising.

## Documentation

[`docs/engineering/`](docs/engineering/) is the as-built documentation: what the system does,
how each part works, and *why* it was built that way — including the decisions that were
reversed. Where it and the code disagree, both are wrong and it gets fixed.

Start with [01 — System overview](docs/engineering/01-system-overview.md), or jump to
[09 — Decision log](docs/engineering/09-decision-log.md) for the 41 load-bearing decisions
with their context and consequences.
[10 — Known gaps](docs/engineering/10-known-gaps.md) is an honest inventory of what's missing;
the largest entry is that there are no automated tests, including none guarding the demo's
boundary.

## Status

Every roadmap phase is shipped: the MVP (0–9), per-player champion tier lists (10), per-player
accounts with owned notes (11), insights (12), the team recap with editable prompt context
(13), scrims (15), draft strategy tools (16), and the public demo with the analytics that came
with it (17).

Phase 14, private per-player AI chat, is **cut** rather than pending — the AI in this app stays
one-way and group-visible.
