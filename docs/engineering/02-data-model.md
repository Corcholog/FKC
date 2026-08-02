# 02 — Data Model

Nine tables. The runnable DDL is `docs/schema.sql` (fresh install) plus the numbered
files in `docs/migrations/` (incremental) — both kept locally, outside this published
folder.

## 1. The shape

```
                    ┌──────────────────────────┐
                    │ players                   │
                    │ id = Riot puuid (text PK)  │
                    │ user_id → auth.users       │
                    │ tier/division/LP snapshot  │
                    │ synced_through  (cursor)   │
                    │ ai_context                 │
                    └───┬──────────────┬────────┘
                        │              │
        ┌───────────────┘              └────────────────┐
        │ 1:N                                      1:N  │
        ▼                                               ▼
┌──────────────────────┐                    ┌────────────────────────┐
│ player_rank_history   │                    │ player_ai_summaries    │
│ append-only LP series │                    │ 1 row/player + stale   │
└──────────────────────┘                    └────────────────────────┘

┌────────────────────┐        1:10        ┌──────────────────────────┐
│ matches             │───────────────────▶│ match_participants        │
│ riot_match_id UNIQ  │                    │ player_id NULL = untracked│
│ excluded  (bool)    │                    │ UNIQUE(match_id, puuid)   │
└────────────────────┘                    └────────────┬─────────────┘
                                                        │ 1:N
                                                        ▼
                                             ┌────────────────────┐
                                             │ match_notes         │
                                             │ author_user_id      │
                                             └────────────────────┘

Singletons (id = 1, enforced by CHECK):
  sync_state · clan_profile · team_ai_summary
```

## 2. `players` — the roster

**The primary key is the Riot puuid, not a surrogate UUID.** A puuid is stable across a
Riot ID rename, which is exactly the identity property you want. It also means
`match_participants.player_id` can be compared directly against `participant.puuid`
during sync with no lookup table:

```ts
// src/lib/sync.ts — knownPlayerIds is a Set of puuids
player_id: isTracked ? p.puuid : null
```

The cost of that choice shows up in one place: if someone genuinely swaps the Riot
account on a roster slot, the primary key itself has to change. That's handled by
`ON UPDATE CASCADE` on the foreign keys plus an explicit backfill — see §7.

Columns worth understanding:

| Column | Notes |
|---|---|
| `display_name` | **Permanent once set.** It doubles as the login identifier, so renaming would either collide with the unique index or hijack another player's login lookup. Protected by a dropped/re-granted UPDATE privilege, not by RLS — see [04](04-auth-and-security.md). |
| `slug` | URL-safe id derived from the Riot ID (`src/lib/slug.ts`). Regenerated on rename, so `/player/[slug]` URLs are not permanent. |
| `user_id` | FK to `auth.users`. NULL = no login yet. Only the service-role client can write it. |
| `tier`/`division`/`league_points` | A **snapshot**, overwritten on every sync. The history lives in `player_rank_history`. |
| `wins`/`losses` | **This app's own tracked record**, not Riot's season totals. Recomputed each sync as a straight count of that player's `match_participants` rows. See §5. |
| `ai_context` | Free text about the person, injected into their AI prompts. |
| `synced_through` | The sync cursor. The single most subtle column in the schema — see [03 §5](03-sync-engine.md). |

`idx_players_display_name_lower` is a **case-insensitive unique index**, because
`resolve_login_email()` looks the name up with `lower()` and an ambiguous match would
make login non-deterministic.

## 3. `matches` and `match_participants`

One row per unique Riot match, **shared across players**. If three tracked players are
in the same game, that's still one `matches` row and one set of ten
`match_participants`. This is what makes the incremental stop condition a single lookup
instead of a per-player one.

### The `excluded` flag, and the invariant it creates

A match is excluded when any of these is true (`src/lib/sync.ts:381`):

```ts
const excluded =
  match.info.queueId !== 420 ||                                  // not ranked solo/duo
  match.info.gameDuration < MIN_COUNTED_DURATION_SECONDS ||      // under 15:00
  match.info.participants.some((p) => p.gameEndedInEarlySurrender); // remake
```

**An excluded match still gets a `matches` row, and gets no `match_participants` rows
at all.**

That asymmetry is doing real work in both directions:

- *Why keep the `matches` row?* Because the incremental walk's stop condition is "have I
  already seen this match id?". A match id with no row is one the walk re-fetches on
  every sync, forever — one wasted Riot call per excluded game per day, permanently.
- *Why no participant rows?* Because **every read path in the app joins through
  `match_participants!inner`**. A match with no participants is therefore invisible to
  every query without a single `WHERE excluded = false` clause in any page or read path.
  (The only two `.eq("excluded", false)` calls in the codebase are in `refetchMatchDetails`,
  which walks the *matches* table directly.) The exclusion enforces itself structurally
  rather than by discipline.

This is the invariant to hold onto: **`match_participants` is the set of games that
count. `matches` is the set of games that have been seen.**

### `player_id` is nullable, and the nulls are not dead weight

Ten rows are stored per match — all five allies and all five enemies. `player_id` is set
only for tracked players; the other nine are NULL.

Those nine untracked rows are what power:
- the full 10-player match detail breakdown,
- lane matchups and the "nemesis" stat (`src/lib/matchups.ts`), which works entirely by
  finding the enemy with the same `team_position`,
- team composition strips on every match row.

None of that costs an extra Riot call, because the match-detail response contains all
ten participants whether you parse them or not.

### Column groups

```
identity     match_id, player_id, puuid, riot_game_name, riot_tag_line
context      team_id, team_position, champion_id, champion_name, win
core stats   kills, deaths, assists, damage_dealt_to_champions, gold_earned,
             total_minions_killed, neutral_minions_killed,
             total_cs  ← GENERATED ALWAYS AS (minions + neutral) STORED
detail       vision_*, wards_*, total_damage_taken, damage_self_mitigated,
(mig. 005)   heals/shields on teammates, time_ccing_others, *_takedowns,
             objectives_stolen, first_blood_*, {double..penta}_kills,
             total_time_spent_dead, longest_time_spent_living, champ_level,
             items int[], summoner1_id, summoner2_id
jsonb        pings, challenges
```

Three things worth pulling out:

**`total_cs` is a generated stored column.** Minion CS and jungle CS are stored
separately because they mean different things, but every consumer wants the sum. A
generated column means nobody can forget to add them.

**`items` is an `integer[]` in slot order, with `0` for empty.** Slot order is
meaningful — index 6 is the trinket — so gaps are preserved as `0` (Riot's own
representation) rather than filtered out.

**`pings` and `challenges` are `jsonb`, and that's a considered choice, not laziness.**
Riot has added and removed ping counters between patches (`dangerPings` was dropped
once). Columns would mean a migration per patch for data nobody aggregates. `challenges`
is 100+ keys at ~2–3 KB per participant — ~30 KB per match — which would dominate the
whole database, so only a whitelist is kept:

```ts
// src/lib/riot.ts
export const CHALLENGE_KEYS = ["soloKills", "killParticipation", …] as const;
```

The rule is: **add to `CHALLENGE_KEYS`, never store the blob.**

### The nullable-detail problem

Every migration-005 column is nullable, for two independent reasons: Riot drops fields
between patches, and rows synced *before* that migration have nothing in them until the
Settings "Re-fetch match details" action backfills them.

This is why the aggregation layer carries a second set of counters:

```ts
// src/lib/player-stats.ts
detailGames: number;            // rows that actually carried the new columns
detailDurationSeconds: number;  // and their combined duration
```

A half-backfilled database therefore reports *"best vision score, 4 games"* rather than
quietly averaging real values against nulls. And any per-minute rate over a detail
metric divides by `detailDurationSeconds`, not by total duration — dividing by games
that never reported the numerator would silently halve the answer.

## 4. `player_rank_history` — why it exists at all

**Riot has no endpoint that returns a player's past LP.** The tier/division/LP columns
on `players` are overwritten by every sync. Without this table the rank graph could
never be reconstructed after the fact, and every sync that ran before the table existed
is a data point that is gone permanently.

That's why migration 004 was worth running the day it was written rather than batched
with other work — an unusual property for a schema change, and a good thing to be able
to articulate.

Append rules (`recordRankHistory`, `src/lib/sync.ts:497`): write a new point when the
rank actually moved, **or** when the newest point is more than 20 hours old. Without the
first condition the manual Sync button would fill the table with identical rows; without
the second, a plateau would leave a gap in the graph.

## 5. The win/loss definition — a consequence worth knowing

`players.wins` / `losses` are recomputed on each sync as a count of that player's
`match_participants` rows (`refreshPlayerRank`, `src/lib/sync.ts:461`):

```ts
const wins = participantRows.filter((r) => r.win).length;
const losses = participantRows.length - wins;
```

Since excluded games have no participant rows, **an excluded game does not count as a
win or a loss in the app's record**. But rank and LP come straight from Riot's league
endpoint, so a sub-15-minute win still moves the LP chart.

The result: the LP graph can tick up on a day the W/L record doesn't move. That is
intended and documented in migration 007, not a bug — but it is exactly the sort of
inconsistency that looks like one, which is why it's stated here explicitly.

## 6. `match_notes` — the one table with a real owner

Notes attach to a **`match_participant`** row, not to a match. So a note is always "what
*this person* did in *this game*", which matches the review use case.

- `author_user_id` — the `auth.users` row of the writer. Nullable, `ON DELETE SET NULL`,
  so removing a login preserves the note and merely orphans it.
- `author_name` — legacy free-text field from before per-player logins existed. Display
  fallback only; nothing writes to it any more.

The RLS on this table is the only non-trivial policy set in the schema:
everyone signed in reads every note, only the player whose game it is may insert one,
and only the author may edit or delete. See [04 §4](04-auth-and-security.md).

Notes are also **the only irreplaceable data in the database.** Everything else can be
re-fetched from Riot. Migration 007 opens with a query to check for notes about to be
cascade-deleted before it removes short games — a good instinct to copy.

## 7. Identity change: what happens on a Riot ID edit

Handled in `updatePlayer` (`src/app/(app)/settings/actions.ts:112`):

1. If the game name or tag line changed, re-resolve the Riot ID to a puuid.
2. **A cosmetic rename returns the same puuid** → nothing structural happens, just new
   name/slug columns.
3. A genuinely different puuid means the roster slot now points at a different Riot
   account. The `players.id` primary key is updated (FKs cascade via `ON UPDATE
   CASCADE`), and `backfillPlayerHistory()` runs immediately.

That backfill exists because the new puuid's history has zero overlap with anything
stored, and the normal daily sync would only crawl backwards 200 matches per run. It
deliberately passes `synced_through: null` — the old puuid's cursor says nothing about
the new account's coverage.

If the backfill fails (expired key, rate limit), the rename still succeeds and the
action returns a message saying so. Partial success is reported as partial success.

## 8. Indexes

```sql
idx_matches_game_creation         (game_creation desc)   -- every "recent matches" query
idx_matches_fetched_at            (fetched_at)           -- the resumable refetch queue
idx_participants_player           (player_id)            -- per-player aggregation
idx_participants_match            (match_id)             -- the 10-row fan-out
idx_rank_history_player_time      (player_id, recorded_at desc)
idx_notes_participant             (match_participant_id)
idx_notes_author                  (author_user_id)
idx_players_display_name_lower    lower(display_name) UNIQUE
```

`idx_matches_fetched_at` is the interesting one: it exists purely so the "Re-fetch match
details" action can page through matches oldest-fetch-first and bump `fetched_at` as it
goes, which makes an interrupted run resume rather than restart. The index *is* the
resume mechanism.
