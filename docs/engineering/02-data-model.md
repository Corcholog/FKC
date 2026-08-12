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

## 9. Scrims — a second, deliberately separate island

Five tables (`scrim_opponents`, `scrim_series`, `scrim_games`, `scrim_picks`,
`scrim_game_notes`) hold hand-entered tournament games. They share no rows with anything
above, and that is the design, not an accident of sequencing.

**Why they can't share `matches` / `match_participants`.** `matches.riot_match_id` is
`unique not null` and a scrim has no Riot id; `match_participants.puuid` is `not null` and
an enemy university player is a nickname somebody typed, not a resolvable account. But the
reason that actually decided it is §3's invariant read the other way round: *every* soloq
read path joins `match_participants!inner` with no queue filter. That invariant is what
makes `excluded` work — and it's also what would silently pull scrim rows into the hall of
fame, `/champions`, duo stats, streaks, sessions, the hour heatmap, the AI prompts and the
Discord standings. Around twelve modules, each needing a filter added, where missing one
produces a wrong number rather than an error. ADR-029.

**What is shared is the vocabulary, and it's shared completely.** `scrim_picks.team_position`
holds the same `TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY` strings as `match_participants`, and the
stat columns are named to match `ChampionStatInput`. So:

- `sortByRole`, `formatRole`, `mainRole` (`lib/roles.ts`) take scrim picks with no adapter
- a pick joined to its game *is* a `ChampionStatInput`, so `topChampionsByPlayer`,
  `championWinRate`, `championKdaRatio` and both champion comparators work unchanged
  (`damage_dealt_to_champions` is passed as 0 — scrims don't record damage)

**Shape notes.**

| Table | Worth knowing |
|---|---|
| `scrim_opponents` | Unique on `lower(name)`. Free text would fragment one team's history across `UBA`/`uba`, which is the one thing scouting can't survive. |
| `scrim_series` | `played_on` is a `date`, not a timestamptz: nobody records what time a scrim started. `fearless` scopes "no repeats", which only means anything inside a series. |
| `scrim_games` | `side` is *ours*; theirs is implied. Bans are `integer[]` — no role, no player, order is the data, ≤5 a side. Same call as `match_participants.items`. `duration_seconds` is nullable, and a missing one costs the CS/min column rather than the game. |
| `scrim_picks` | `unique (game_id, ally, team_position)` — ten rows, one per role per side. This is what stops a mistyped draft becoming a six-man team. |
| `scrim_game_notes` | A thread per game, not a column on the game. Added in migration 013, which also dropped the `scrim_games.notes` it replaced. `parent_note_id` (014) carries replies at any depth. |

**Notes on a game are a thread, and that's the one place scrims don't follow their own RLS
rule.** The other four tables are `authenticated_full_access` — five people who play the same
games, so anyone can fix anyone's typo (ADR-029). Notes invert on both axes:

- *Why a table, not the column it replaced.* One text field is last-write-wins. Two players
  writing up the same block on the same evening would overwrite each other with no trace of
  which observation survived. The column shipped in 012 and was never writable — the entry
  form had no field for it — so 013's data migration moved nothing in practice, but it runs
  the copy before the `drop column` anyway.
- *Why author-scoped writes.* A wrong champion in a draft is shared data anybody should
  correct. Somebody else's written opinion isn't theirs to rewrite. So `scrim_game_notes`
  follows `match_notes`: everyone reads, author-only edit and delete.
- *Why anyone may insert.* `match_notes` gates inserts on `owns_participant()`, because a
  soloq game belongs to exactly one tracked player. A scrim belongs to all five, so there is
  nothing to gate on.
- *Why no `author_name`.* That column on `match_notes` is a legacy fallback from before
  per-player logins. Here the author is resolved through `players.user_id` at render time
  (`lib/scrims/notes.ts`), so a display-name change relabels their whole history instead of
  stranding old notes under an old spelling.

A note typed while entering a game becomes the first row of that game's thread, authored by
whoever entered the series — one concept for "notes on this game" rather than an entry-time
field sitting beside a thread that says the same thing.

**Replies nest in the data and flatten in the rendering.** A reply can be replied to, so
`parent_note_id` holds the real target at whatever depth — collapsing it on write would
silently change what somebody was answering. `threadNotes` then flattens each thread to two
visual levels, ordering every answer below a root by time and labelling any whose target
*isn't* the root (`replyingTo`). That's the YouTube/Instagram shape, chosen because this sits
inside a card already carrying twenty champion portraits.

The reader is deliberately defensive, because actions are reachable by direct POST and a row
written outside `addScrimGameNote` must still render:

- it walks to the root rather than trusting one hop, with a `seen` set instead of an
  arbitrary depth cap, so it terminates on a cycle without losing the notes in it
- an unresolvable parent (another game, deleted between reads) makes the note its own root —
  visible and slightly wrong beats invisible
- every note is assigned to exactly one thread. Without that, a parent cycle yields two notes
  that are each other's replies *and* both roots, and the page renders each of them twice.
  A harness case covers it.

`descendantCount` is the whole subtree, not the direct children, because deleting a note
cascades recursively — the confirm dialog names that count before it happens.

**Opponent rosters are derived, not stored.** Grouping enemy picks by
`(team_position, lower(player_name))` yields "their toplaner is Peluca, Renekton ×4" with no
extra entry step. A real opponent-player table would mean registering every enemy before a
draft could be typed, which is the kind of friction that stops drafts being typed at all.
The price is that a typo splits one person in two — fixable by editing the series.

**Reads go through `fetchAllRows`/`fetchAllByIds` like everything else** (`lib/scrims/queries.ts`,
`lib/scrims/notes.ts`). At ten picks a game, PostgREST's silent 1000-row truncation arrives at a
hundred games, which one tournament season passes. Notes are loaded the same way and only on the
two pages that render them — every other scrim page derives aggregates, and prose feeds none of
them.

## 10. Draft strategy — `draft_tags` and `champion_profiles`

Migration 015, first of three for the draft-tools section documented in
`docs/features/draft-strategy/`. This entry covers the two tables that phase shipped;
`champion_counters` (016) and `draft_comps` (017) get their own entries when they land.

**No foreign key on `champion_profiles.champion_id`, and none is possible.** Exactly the
`champion_tier_lists` precedent from §2: there is no champions table in this database, and
this migration doesn't create one. Names and icons come from Data Dragon at request time
(`src/lib/ddragon.ts`); `champion_profiles` holds only what DDragon can't — lane roles and
function tags — keyed by DDragon's numeric id, validated server-side against
`new Set(championMap.keys())` on every write instead of by a constraint the database can't
express.

**A champion with no annotations has no row.** The page joins the full DDragon roster
against this table and renders an empty state per champion; there is no pre-seed and no
backfill when Riot ships a new one.

**`draft_tags` is a managed vocabulary, not free text and not a constant.** Free text
fragments across `Engage`/`engage`/`Engaje` within a week — the same problem
`scrim_opponents` solves for team names (§9). A hardcoded array would be type-safe but
needs a deploy to add a tag, and the vocabulary is meant to grow while prepping for a
specific opponent. `idx_draft_tags_label_lower` is case-insensitive **per kind**, so
`'Engage'` (function) and a hypothetical `'Engage'` (win_condition) don't collide with each
other — they mean different things in different tables' rows.

**One `kind` column serves two tables' vocabularies.** `function` tags describe a champion
(`champion_profiles.tags`); `win_condition` tags describe what a comp or synergy is trying
to do (`draft_comps.win_conditions`, migration 017). They're the same *kind* of thing —
free-form, team-agreed labels — read through the same UI component
(`TagMultiSelect`), so one table serves both rather than duplicating the CRUD, the
uniqueness index and the rename/delete flow twice.

**RLS follows `champion_tier_lists`, not `match_notes`.** `authenticated_full_access` on
both tables — anyone signed in can annotate, correct or delete anything.
`champion_profiles.updated_by` is attribution ("last touched by Corcho"), not enforcement,
same reasoning as `scrim_series.created_by` (§9): somebody has to be able to fix a
teammate's tag.
