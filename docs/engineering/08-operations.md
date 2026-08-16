# 08 — Operations

## 1. Local setup

```bash
npm install
cp .env.local.example .env.local     # fill in the values below
npm run dev
```

| Variable | Where it comes from | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same page | "Publishable" in new naming, "anon" in legacy. Either works. |
| `SUPABASE_SECRET_KEY` | same page | "Secret" / legacy "service_role". **Bypasses RLS — server only.** |
| `GEMINI_API_KEY` | ai.google.dev → Get API Key | |
| `CRON_SECRET` | generate yourself | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DISCORD_WEBHOOK_URL` | Discord → Edit Channel → Integrations → Webhooks | **Optional.** Unset = every notification no-ops. See §4. |

**The Riot API key is not an env var.** It lives in `sync_state.riot_api_key` and is set
from `/settings`. See [01 §4](01-system-overview.md).

`next.config.ts` derives the allowed Supabase image hostname from
`NEXT_PUBLIC_SUPABASE_URL`, so avatars break if that variable is missing at build time —
worth knowing, because the symptom (broken avatar images in production only) doesn't point
at the cause.

## 2. Database setup

- **Fresh project:** run `docs/schema.sql` in the Supabase SQL editor. It creates every
  table, index, RLS policy, grant, and helper function in one shot.
- **Existing project:** run the numbered files in `docs/migrations/` in order. They're
  written to be idempotent and safe to re-run.
- Create a Storage bucket named `avatars`, public read.
- Create the shared viewer login by hand: Authentication → Users → Add User. Per-player
  logins are created afterwards from `/settings`.

Migrations to date:

| # | What it did |
|---|---|
| 001 | Per-player accounts (`players.user_id`, note ownership) |
| 002 | Display-name login (`resolve_login_email`, case-insensitive unique index) |
| 003 | Fixed the tracking-start boundary |
| 004 | `player_rank_history` + `players.synced_through` |
| 005 | ~30 participant detail columns + `pings`/`challenges` jsonb |
| 006 | `clan_profile`, `players.ai_context`, `team_ai_summary` |
| 007 | Excluded games under 15 minutes |
| 008 | Summary regeneration gate |
| 009 | AI summaries opt-in |
| 010 | Champion tier lists |
| 011 | Revoked `authenticated` access to `sync_state` (the Riot key) |
| 012–014 | Scrims: opponents, series, games, picks, then note threads and replies |
| 015–017 | Draft strategy: tags + champion profiles, counters, comps |
| 018 | The demo layer: 3 mapping tables, 13 views, `select` to `anon` |
| 019 | `demo_player_summaries`, the view that publishes reviewed AI text |
| 020 | `scrim_opponents.target_bans` — the ban plan; recreates `demo_scrim_opponents` |

Migration 007 is the one to read as a template — it opens with a query to check what
you're about to lose (cascade-deleted notes) *before* it deletes anything, and states the
expected side effect (W/L totals tick down) up front.

018 is the one to read **before editing anything demo-shaped**. It carries the warning that
matters (`security_invoker` must stay off, or the demo silently renders empty) and a verify
block that proves the boundary from outside with `curl` rather than asserting it. 019's
verify block is the same shape: read the view as `anon`, then confirm the underlying
`demo_text` still answers `42501` and that its columns answer `42703` through the view.

## 3. Deployment

Vercel, connected to `main`. `vercel.json` registers two crons:

```json
{ "crons": [
  { "path": "/api/sync",      "schedule": "0 10 * * *" },
  { "path": "/api/summaries", "schedule": "0 11 * * *" },
  { "path": "/api/weekly",    "schedule": "0 23 * * 0" }
]}
```

The weekly wrap runs Sunday 23:00 UTC = 20:00 local, i.e. Sunday evening rather than
Monday morning, so it lands while the week it describes is still the one people remember.
Weekly is *less* frequent than daily, so it sits inside the Hobby once-per-day cap.

Buenos Aires is UTC−3 year-round (no DST since 2009), so 10:00 UTC = 07:00 local.

Three Hobby-tier facts that shaped this:
- Cron **frequency** is capped at once per day; the number of jobs is not (limit is 100 on
  every plan).
- Vercel only guarantees the run happens *within the UTC hour*, not at the minute. Worst
  case (sync at 10:59, summaries at 11:00) the recap describes the previous day's games.
  Annoying occasionally, never wrong, and not worth coupling the jobs to avoid.
- Function `maxDuration` is capped at 60s. Both routes declare `export const maxDuration =
  60` explicitly — without it, non-Fluid-Compute deployments default to 10–15s and the
  sync gets killed mid-run.

Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`, which both routes accept as an
alternative to a session.

## 4. Observability

There is no logging service, no error tracker and no metrics. `sync_state` is still the
only *stored* state, but it is no longer the only way to find out something broke:

| Signal | Where it shows |
|---|---|
| `riot_key_valid = false` | Site-wide banner on every page (`KeyExpiredBanner`) **+ Discord** |
| `last_sync_status`, `last_sync_finished_at` | Dashboard sidebar card, Settings |
| `last_error` | Settings **+ Discord** |
| Per-run result | Toast from the navbar Sync button |
| Promotions / demotions | Discord |
| Pentakills and quadrakills | Discord |
| The daily clan recap | Dashboard **+ Discord** |
| Daily standings (with LP delta) | Discord |
| The Sunday week-in-review | Discord |

### The webhook

`src/lib/discord.ts`, one function, sent from `/api/sync` and `/api/summaries`.

Every signal above was previously *pull*: a row nobody queries and a banner nobody reads
on a morning when nothing seems wrong. A cron that failed at 07:00 could stay unnoticed
for days. The webhook makes the failures push instead, which is most of the practical
distance between "no observability" and "enough for five people".

Three properties worth keeping if this is ever changed:

- **It cannot fail a job.** `notifyDiscord` swallows everything into `console.error` and
  has a 5s `AbortSignal.timeout`. A webhook is a notification channel, not a dependency —
  a sync must still finish, and still report its own result honestly, with Discord down.
- **It is optional.** No `DISCORD_WEBHOOK_URL` means every call no-ops. Local development
  and a fresh deploy work unchanged without it.
- **It sends on state changes, not on activity.** Failures, key expiry, tier/division
  moves, multikills, and the scheduled digests. Deliberately *not* per-match results or LP
  ticks — a webhook that fires forty times a day is a webhook everyone mutes, and a muted
  webhook is worth less than no webhook, because it looks like coverage.

Rank changes and multikills are collected during the sync (`SyncSummary.rankChanges`,
`SyncSummary.multikills`) and sent by the route once the run has finished and its status is
written, so a notification can never delay or corrupt the database record of the run.

Three more properties that are load-bearing rather than cosmetic:

- **Standings are cron-only.** The Settings "Regenerate summaries now" button reaches the
  same handler, so the post is gated on `isCron`. A leaderboard that reposts whenever
  somebody pokes Settings is the fastest route to a muted channel.
- **Multikills can't replay.** Detection runs only on a match the current call just
  inserted, and `riot_match_id` is unique — so a shared game is announced once no matter
  how many tracked players were in it, and a re-sync takes the `23505` branch instead. The
  separate 48h age guard covers a different case: adding a player backfills their whole
  history, which would otherwise dump every penta they have ever had into the channel. A
  penta suppresses the quadra from the same game, since a penta is reached *through* one.
- **A section with nothing to say prints nothing,** and a week with no games posts nothing
  at all. Padding the wrap with "no notable duos this week" every week teaches people to
  skim the whole message.

## 5. Runbook

### The Riot key expired

**Symptom:** amber banner on every page; `sync_state.last_error` mentions 401/403.

Expected roughly daily — personal keys have a 24-hour lifetime.

1. Regenerate at <https://developer.riotgames.com/>.
2. `/settings` → Riot API key → paste → save. This optimistically sets `riot_key_valid =
   true`; the next sync flips it back if the key is still bad.
3. Press Sync.

### A sync says "partial"

**Not an error.** The run hit its 50-second budget before walking every player's history.
Press Sync again — `players.synced_through` means it resumes rather than restarting.

Repeated partials with no progress means either a genuine backfill in flight (normal after
adding a player) or a stuck cursor (see below).

### `409 Sync already running`

Either a sync is genuinely in flight, or a previous run was killed before it could write
its status. The route auto-clears a `'running'` claim older than 10 minutes
(`STALE_RUN_MS`), so **wait 10 minutes and retry** before touching anything.

Manual override if needed:

```sql
update sync_state set last_sync_status = 'error' where id = 1;
```

### A player's history looks incomplete

1. Check `players.synced_through` — NULL means nothing is confirmed contiguous yet.
2. Confirm the games are after `TRACKING_START_DATE` (2026-07-29T15:00:00Z).
3. Confirm they aren't excluded: remakes, sub-15-minute games, and non-420 queues are
   invisible by design.

```sql
-- games seen but deliberately not counted
select riot_match_id, game_creation, game_duration_seconds
from matches where excluded = true order by game_creation desc;
```

4. Press Sync repeatedly. Each run walks further back.

### Detail stats show em dashes or low game counts

Migration-005 columns are NULL on rows synced before it ran. `/settings` → **Re-fetch
match details**. It's time-boxed and resumable — the button reports how many are left, and
you press it again. Excluded matches are skipped.

### Summaries aren't updating

1. `select player_id, stale, generated_at from player_ai_summaries;` — nothing stale means
   nothing changed, which is correct behaviour.
2. Hit `/api/summaries` (the Settings button) and read the error. `describeGeminiError`
   distinguishes per-minute from per-day quota, and both from an overloaded model (503) or
   a bad key.
3. Per-day quota resets at **midnight Pacific**.

### After adding a player

Their history is not backfilled automatically on add — the next sync discovers it, walking
back up to 200 matches per run. Press Sync a few times. (A Riot *ID change* on an existing
player does trigger an immediate backfill; a brand-new player doesn't.)

**They do not appear on `/demo`, and that is deliberate.** Every demo view joins
`demo_aliases` inner, so a player with no alias row is invisible there. Publishing someone
takes one insert:

```sql
insert into demo_aliases (player_id, alias, alias_slug)
values ('<puuid>', 'Vesper', 'vesper');
```

Same for a new scrim opponent, in `demo_opponent_aliases` — until then their series and
games are hidden too.

### A demo page shows nothing where the private one shows text

Working as designed. Every free-text column is served through `demo_text`, and a row with
no override renders empty ([09, ADR-037](09-decision-log.md)). To publish a specific note,
insert one row keyed on its surface and id:

```sql
insert into demo_text (source, row_id, body) values ('counter', '<counter uuid>', '…');
-- sources: champion_profile | counter | comp | comp_label | opponent | series
```

Then wait out the 1-hour data cache, or redeploy.

### The demo shows stale numbers

`/demo` caches its reads for an hour (`DEMO_REVALIDATE_SECONDS`). A publish from `/settings`
calls `revalidateTag("demo", "max")`, which is stale-while-revalidate — **the first load
after publishing still shows the old page**. Load it twice before concluding anything is
broken.

### Generating the demo's AI summaries

`/settings` → *Demo summaries*. The button generates drafts for whoever doesn't have one;
about three fit in a 60-second invocation, so press it until it stops saying `remaining`.
Nothing reaches `/demo` until you press **Publish** on that player's row, and the status
line on each row reads the *published* text, not the box — "live, but not this version"
means the box has been edited since. An empty box plus Publish takes the card down.

This is the one AI path with no cron behind it, on purpose ([06 §6b](06-ai-layer.md)).

## 6. Cost and capacity

Everything runs on free tiers. The ceilings that actually bind, roughly in the order
they'd be hit:

| Limit | Value | Headroom |
|---|---|---|
| Riot personal key | 100 req/2min, ~40–50 calls per 60s function | **Binding today** on busy days |
| Gemini free tier | requests/day | Fixed at roster + 1/day by design |
| Vercel Hobby cron | 1/day per job, 60s max duration | Binding — drives the whole partial-run design |
| Supabase free | 500 MB database | Comfortable; ~30 KB/match avoided by the `challenges` whitelist |
| Supabase free | Pauses after 7 days of inactivity | The daily cron keeps it awake |
| Supabase Storage | 1 GB | A handful of avatars |

The Supabase pause behaviour is worth noting: the daily cron is what keeps the project
from being paused for inactivity. Disabling it would eventually take the app offline.

## 7. Things that need changing together

Constants deliberately duplicated across code and SQL, because SQL can't import from
TypeScript:

| Concept | TypeScript | SQL |
|---|---|---|
| 15-minute floor | `MIN_COUNTED_DURATION_SECONDS`, `sync.ts` | migration 007 |
| Tracking start | `TRACKING_START_DATE`, `sync.ts` | migration 003 |
| Chart palette | `SERIES_COLORS`, `chart-theme.ts` | mirrors `globals.css` |
| Challenge whitelist | `CHALLENGE_KEYS`, `riot.ts` | (jsonb — no schema change needed) |

Adding a writable column to `players` also means adding it to the `grant update (…)` list
in `schema.sql`, or it's silently read-only for signed-in users. See
[04 §5](04-auth-and-security.md).

**A column added to a base table does not reach its `demo_` view**, because every view
lists its columns explicitly. That is the safe direction — the demo shows less, never more
— but it means a new column the demo *should* show needs a migration that recreates the
view, plus a check that nothing in the new column is identifying. See
[02 §13](02-data-model.md) for the criterion.

## 8. Commands

```bash
npm run dev      # next dev
npm run build    # next build — the only real check in CI-less repo: types + lint
npm run start    # next start
npm run lint     # eslint
```

There is no test suite. `npm run build` is the closest thing to a gate, and TypeScript
`strict` mode is doing most of the work.
