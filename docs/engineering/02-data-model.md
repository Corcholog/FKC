# 02 — Data Model

Nine core tables, plus three later islands that hang off them: team matches (§9), draft strategy
(§10–12), and the demo's mapping layer (§13–14). The runnable DDL is `docs/schema.sql`
(fresh install) plus the numbered files in `docs/migrations/` (incremental) — both kept
locally, outside this published folder.

## 1. The shape

```
                    ┌──────────────────────────┐
                    │ players  (uuid PK)        │
                    │ user_id → auth.users       │
                    │ best soloQ rank snapshot   │
                    │ primary account's Riot ID  │
                    │ ai_context                 │
                    └───┬──────────────┬────────┘
                        │ 1:N
                        ▼
                ┌────────────────────────────┐
                │ player_accounts             │
                │ puuid (text PK)             │
                │ platform · is_primary       │
                │ track_solo / track_flex     │
                │ per-queue rank + cursors    │
                └────────────────────────────┘
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

Plus two islands with their own sections: team matches (§9) and the demo (§13). The demo
adds no facts — three mapping tables and fourteen views over everything above.
```

## 2. `players` — the roster

**The primary key was the Riot puuid until migration 023, and is a surrogate uuid now.**

The original reasoning was good and is worth keeping: a puuid is stable across a Riot
ID rename, and it let the sync compare `match_participants.player_id` straight against
`participant.puuid` with no lookup table. What broke it is that the roster plays flex on
accounts that are not the ones they solo queue on, and one of them solo queues on BR
while the rest are on LAS. A puuid is a fine identity for an *account* and the wrong one
for a *person*.

So the accounts became rows (`player_accounts`, §2b) and `players.id` became a uuid. The
sync now resolves through a map built from that table:

```ts
// src/lib/sync.ts
playerId: playersByPuuid.get(p.puuid)?.playerId ?? null
```

That also retired the account-swap machinery: pointing a roster slot at a different Riot
account used to be an UPDATE of the primary key, which threw the old account's history
away. It is an insert into `player_accounts` now, and both histories are kept.

Columns worth understanding:

| Column | Notes |
|---|---|
| `display_name` | **Permanent once set.** It doubles as the login identifier, so renaming would either collide with the unique index or hijack another player's login lookup. Protected by a dropped/re-granted UPDATE privilege, not by RLS — see [04](04-auth-and-security.md). |
| `slug` | URL-safe id derived from the Riot ID (`src/lib/slug.ts`). Regenerated on rename, so `/player/[slug]` URLs are not permanent. |
| `user_id` | FK to `auth.users`. NULL = no login yet. Only the service-role client can write it. |
| `tier`/`division`/`league_points` | A **snapshot**, overwritten on every sync. The history lives in `player_rank_history`. |
| `wins`/`losses` | **This app's own tracked record**, not Riot's season totals. Recomputed each sync as a straight count of that player's `match_participants` rows. See §5. |
| `ai_context` | Free text about the person, injected into their AI prompts. |
| ~~`synced_through`~~ | Moved to `player_accounts`, and split per queue — coverage is a property of an account and a queue, not of a person. See §2b and [03 §5](03-sync-engine.md). |

`idx_players_display_name_lower` is a **case-insensitive unique index**, because
`resolve_login_email()` looks the name up with `lower()` and an ambiguous match would
make login non-deterministic.

## 2b. `player_accounts` — the Riot accounts one person owns

Migration 023. The puuid is still a primary key, just not the *player's* — it is the
natural key of an account, and it is what a match participant carries, so the sync's
puuid → player lookup stays a single index hit.

| Column | Notes |
|---|---|
| `platform` | Now load-bearing. `LA2` = LAS, `BR1` = Brazil. Match history is regional, rank is per-platform — see [03 §1](03-sync-engine.md). |
| `is_primary` | Exactly one per player, enforced by a **partial unique index** (`where is_primary`). The primary account is the one whose Riot ID and rank are mirrored onto `players`. |
| `track_solo` / `track_flex` | Which walks this account is worth spending Riot calls on. Flex defaults **off**: most accounts never queue it, and one id-page call per account per run is real money against a 100-req/2min key. |
| `tier`/`division`/`league_points` + `flex_*` | Per-queue snapshots. League-V4 returns every queue in one response, so the flex columns cost no extra call. |
| `synced_through_solo` / `_flex` | Two cursors, because the queues have different tracking start dates. |
| `last_walked_at` | Bumped on every visit, so the walk is ordered oldest-visit-first — see [03 §5](03-sync-engine.md). |

**Three things stayed denormalised on `players`, and each is a deliberate refusal to add
a join.** The primary account's `riot_game_name`/`riot_tag_line`/`platform`, because dozens
of read sites render "their Riot ID" and all of them mean the primary one. The best soloQ
`tier`/`division`/`league_points`, because `RankBadge`, the roster grid's sort,
`buildStandings` and the dashboard Squad list all read them and none wants to work out
which account was highest. And `wins`/`losses`, which is still **the soloQ record
specifically** — the sync counts it through `soloq_participants`, so flex cannot inflate a
rank badge.

"Best" is by `ladderPoints` (`lib/rank.ts`), which projects tier/division/LP onto one
continuous scale — so it compares a LAS main against a BR smurf correctly, where comparing
tier strings or raw LP would both get a Gold I / Silver II pair backwards.

**`player_rank_history` gained `account_id` and `queue`.** One series per (account, queue):
a smurf's climb is not the main account's, and flex LP is not soloQ LP. Both were
recoverable for existing rows and only at migration time — the old `player_id` *was* the
puuid, and every point written before then came from a `RANKED_SOLO_5x5` lookup — which is
why 023 backfills them before dropping the column rather than leaving it to a later one.

## 3. `matches` and `match_participants`

One row per unique Riot match, **shared across players**. If three tracked players are
in the same game, that's still one `matches` row and one set of ten
`match_participants`. This is what makes the incremental stop condition a single lookup
instead of a per-player one.

### The `excluded` flag, and the invariant it creates

A match is excluded when any of these is true (`src/lib/sync.ts:381`):

```ts
const excluded =
  !TRACKED_QUEUE_IDS.includes(match.info.queueId) ||             // not 420 or 440
  match.info.gameDuration < MIN_COUNTED_DURATION_SECONDS ||      // under 15:00
  match.info.participants.some((p) => p.gameEndedInEarlySurrender); // remake
```

The queue test is *membership*, not equality with the queue being walked. That is what
lets a game one queue's walk turns up be kept and counted rather than discarded as
off-queue — see §3b.

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

## 3b. Two queues in one table, and the views that keep them apart

Migration 024. A flex game is the same Riot payload with a different `queueId`, so giving
it its own tables would duplicate the sync writer, the row mapper, the ten-participant
fan-out and every stats query for data of an identical shape.

But §9's argument for keeping scrims out applies word for word: *every soloq read path
joins participants with no queue filter*, so shared rows would poison every existing stat
— around a dozen modules, each needing a filter added, where missing one produces a wrong
number rather than an error.

The resolution is that the filter stops being something anybody has to remember.
`src/lib/data-source.ts` already existed so one loader could serve the private app and the
demo by swapping a table name; it now swaps the queue too:

```
source.table("match_participants")  ->  soloq_participants
                                        flex_participants
                                        ranked_participants
```

A page reads soloQ because of *which view it was handed*, not because somebody wrote
`.eq("queue_id", 420)` in the right dozen places. `privateSource()` defaults to `solo`, so
every page that existed before flex did reads exactly the rows it read before, untouched.

**`queue_id` is denormalised onto `match_participants`** so those views are single-table
projections. A view whose predicate needed a join to `matches` would work, but PostgREST's
resource embedding is what every read path here depends on, and a plain projection is the
case it handles most simply.

**Two costs worth knowing.** `select *` in a view is expanded at CREATE VIEW time, so
adding a column to `match_participants` means recreating all three views in the same
migration — otherwise no read path through them can see it. And eight reads bypass
`DataSource` entirely (the navbar's lane sample, the AI prompts, the weekly Discord recap,
the tier-list editor's pool); those name `SOLOQ_PARTICIPANTS` explicitly. The ownership
check in `notes/actions.ts` deliberately stays on the base table and says so — a note on a
flex game is still that player's note.

**`matches` also gained `blue_bans`/`red_bans`.** They were in the match-detail response
all along and the sync threw them away; storing them costs no extra Riot call and gives
flex the same pick/ban analysis `lib/team/draft-stats.ts` computes for team matches.
Existing rows keep `'{}'`, which means "not known" — the Settings re-fetch backfills them.

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

## 9. Team matches — a second, deliberately separate island

Five tables (`team_opponents`, `team_series`, `team_games`, `team_picks`,
`team_game_notes`) hold hand-entered tournament games. They share no rows with anything
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

**What is shared is the vocabulary, and it's shared completely.** `team_picks.team_position`
holds the same `TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY` strings as `match_participants`, and the
stat columns are named to match `ChampionStatInput`. So:

- `sortByRole`, `formatRole`, `mainRole` (`lib/roles.ts`) take scrim picks with no adapter
- a pick joined to its game *is* a `ChampionStatInput`, so `topChampionsByPlayer`,
  `championWinRate`, `championKdaRatio` and both champion comparators work unchanged
  (`damage_dealt_to_champions` is passed as **null**, not 0 — these games record no damage,
  and 0 is a real figure that would drag a dmg/min average down. See [05 §10b](05-stats-and-domain-logic.md).)

**Shape notes.**

| Table | Worth knowing |
|---|---|
| `team_opponents` | Unique on `lower(name)`. Free text would fragment one team's history across `UBA`/`uba`, which is the one thing scouting can't survive. `target_bans integer[]` (migration 020) is the **plan** — who we intend to take off them, in priority order, capped at five by a `cardinality()` check. What we *have* banned is history and lives in `team_games.ally_bans`; keeping the two apart is the whole point of the column. |
| `team_series` | `played_on` is a `date`, not a timestamptz: nobody records what time a scrim started. `fearless` scopes "no repeats", which only means anything inside a series. |
| `team_games` | `side` is *ours*; theirs is implied. Bans are `integer[]` — no role, no player, order is the data, ≤5 a side. Same call as `match_participants.items`. `duration_seconds` is nullable, and a missing one costs the CS/min column rather than the game. `patch` is nullable too and was written by nothing until the entry form grew a field for it — the games that predate that keep their null rather than being backfilled with a guess. |
| `team_picks` | `unique (game_id, ally, team_position)` — ten rows, one per role per side. This is what stops a mistyped draft becoming a six-man team. |
| `team_game_notes` | A thread per game, not a column on the game. Added in migration 013, which also dropped the `team_games.notes` it replaced. `parent_note_id` (014) carries replies at any depth. |

**Notes on a game are a thread, and that's the one place scrims don't follow their own RLS
rule.** The other four tables are `authenticated_full_access` — five people who play the same
games, so anyone can fix anyone's typo (ADR-029). Notes invert on both axes:

- *Why a table, not the column it replaced.* One text field is last-write-wins. Two players
  writing up the same block on the same evening would overwrite each other with no trace of
  which observation survived. The column shipped in 012 and was never writable — the entry
  form had no field for it — so 013's data migration moved nothing in practice, but it runs
  the copy before the `drop column` anyway.
- *Why author-scoped writes.* A wrong champion in a draft is shared data anybody should
  correct. Somebody else's written opinion isn't theirs to rewrite. So `team_game_notes`
  follows `match_notes`: everyone reads, author-only edit and delete.
- *Why anyone may insert.* `match_notes` gates inserts on `owns_participant()`, because a
  soloq game belongs to exactly one tracked player. A scrim belongs to all five, so there is
  nothing to gate on.
- *Why no `author_name`.* That column on `match_notes` is a legacy fallback from before
  per-player logins. Here the author is resolved through `players.user_id` at render time
  (`lib/team/notes.ts`), so a display-name change relabels their whole history instead of
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

**Reads go through `fetchAllRows`/`fetchAllByIds` like everything else** (`lib/team/queries.ts`,
`lib/team/notes.ts`). At ten picks a game, PostgREST's silent 1000-row truncation arrives at a
hundred games, which one tournament season passes. Notes are loaded the same way and only on the
two pages that render them — every other scrim page derives aggregates, and prose feeds none of
them.

## 10. Draft strategy — `draft_tags` and `champion_profiles`

Migration 015, first of three for the draft-tools section documented in
`docs/features/draft-strategy/`. This entry covers the two tables that phase shipped;
`champion_counters` (016) is §11 and `draft_comps` (017) is §12.

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
`team_opponents` solves for team names (§9). A hardcoded array would be type-safe but
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
same reasoning as `team_series.created_by` (§9): somebody has to be able to fix a
teammate's tag.

## 11. `champion_counters` — one directed table, three readers

Migration 016. One row is `counter_champion_id` counters `target_champion_id`, with an
optional `note`. **Directed, not symmetric** — "Renekton counters Nasus" says nothing
about the reverse, and the interesting matchups are exactly the ones where that asymmetry
is the point. Both directions can exist as independent rows; the `unique` constraint is on
the ordered pair, not the unordered one.

Three surfaces read the same table with no duplication: the answers list at
`/draft/counters`, the "counters / countered by" lists on a champion's row in
`/draft/champions`, and the reference panel on `/draft`, which asks it twice — "who beats
these enemy picks" and "what beats ours". Both of those are lookups on
`target_champion_id`; only whose picks go in differs, which is a trap worth knowing about
and is documented at the counter functions in `src/lib/draft/context.ts`. The panel filters
in the browser over the whole table rather than querying per click, so
`idx_champion_counters_target` serves the two page-level readers, not it.

**This is opinions the team holds, not statistics.** Real matchup win rates already exist
via `match_participants` or Lolalytics (`src/lib/lolalytics.ts`); this table is
deliberately something else and doesn't try to reconcile with either.

**One row per pair, but the UI edits a whole side at once.** A champion typically has
several good answers, not one — "who's a good response to Jarvan" is a list, not a single
pick. `CounterGroupEditor` (`src/components/draft/counter-group-editor.tsx`) is keyed on
one champion held constant (`fixed`) and one `direction` (whether `fixed` is the target or
the counter), and edits the *entire* set of rows on that side in one save. Every entry
point — a card on `/draft/counters`, a champion's "Add" button, clicking an existing list
entry — opens this same view rather than a single-pair form, because adding five responses
and editing one are really the same action once "the list for this champion" is the unit
of edit.

**Why `/draft/counters` is a list of answers and not a matrix.** It was a matrix first.
The data gets touched at three moments: writing it down during prep, looking one champion
up during prep, and having it surfaced by the board mid-draft (that last one is the
contextual panel). None of them is "scan the whole relation space", which is the only
thing a grid is good for. A grid also has to put every champion on both axes, so it stays
~97% empty however sparse the data is, and it renders a relation as a dot whose note is
invisible until you hover that one cell — and the note is the substance. `CounterBrowser`
(`src/components/draft/counter-browser.tsx`) shows one card per champion being answered,
notes included, with a `ChampionCombobox` to focus one champion. The combobox is not a
filter over the cards on purpose: it can select a champion with *no* rows yet, which is
precisely when "how do we answer this" is most worth asking.

`saveCounterGroup` (`src/app/(app)/draft/actions.ts`) diffs the submitted list against
what already exists for `fixed`+`direction`: champions still present are updated in place,
new ones are inserted, and any existing row for a champion no longer in the list is
deleted. **`created_by` is only set on insert, never touched on update** — the diff is
what makes that possible without a second round trip, and it matters for the same reason
`team_series.created_by` is never touched by `updateScrimSeries`: the column means "who
wrote the original take," not "who touched this last."

## 12. `draft_comps` — comps and synergies in one table

Migration 017. A saved comp is one full side of a draft (5 champions); a saved synergy is a
combo (2–4). **One table, discriminated by `kind`,** against a spec that asked for two.

They have identical columns — label, champions, win-condition tags, notes — and differ only
in how many champions they hold and what that count means. Two tables would have been two
identical row types, two identical query modules, two identical forms, two save actions,
and a reference panel that queries both and merges the results — which is precisely what it
does *not* have to do: `loadDraftComps(supabase)` with no options hands `/draft` every row
of both kinds in one call, and the panel's sections split on `kind` themselves. The
discriminator costs one `text` column and one check constraint. If a comp ever grows a column a synergy can't
have (per-slot roles, an `opponent_id`, a side), split it then; nothing here makes that
harder.

**`label` is nullable and nothing requires one.** The champions identify the row — "Ornn +
Yasuo", or five portraits in pick order — so a name is worth having when someone has one in
mind ("vs UBA") and pure friction when they don't. There is no constraint on it; unnamed
rows store `NULL`, and `cleanText` in the action turns a blank field into `NULL` so `''` is
never stored. Two representations of "no name" is the usual way this rots.

**Win conditions are comps-only, and that lives in the validator rather than the schema.** A
comp is a plan and worth tagging with what it's trying to win on; a synergy is a combo and
there are enough of them that tagging each is work nobody does. `DRAFT_COMP_SHAPE` in
`src/lib/draft/types.ts` is the single place saying so, and it's deliberately not a
constraint — it's a product call about what a form asks for, not a fact about the data, so
if synergies ever want them nothing migrates.

`compTitle()` supplies a name to the surfaces that can't show portraits: the delete
confirmation, aria-labels, and the search filter (which matches the derived title, so
typing "ornn" finds an unnamed Ornn+Yasuo row — filtering `label` alone would silently
match nothing for most rows). `CompCard` deliberately does *not* use it: it shows the
portraits already, so a heading spelling them out would be two rows saying one thing. The
card's rule is that a real name leads and the champions carry the controls otherwise.

**`champion_ids` is ordered, the order is the author's, and nothing sorts it.** Champions
arrive off the board in draft order and the save dialog lets them be dragged into whatever
order the comp should read in. For a five-champion comp that's team order — top through
support — which makes **position double as role** on every surface that renders it:
`CompOrderEditor` labels each position while you drag, and `CompCard` labels them the same
way afterwards. A synergy is 2–4 champions with no such mapping, so it gets no labels;
inventing them there would be inventing information.

Neither `saveDraftComp` nor `CompCard` sorts the array. An automatic sort would overwrite a
deliberate choice, and a comp read back in an order nobody picked is worse than useless.
Same call as `team_games.ally_bans` (§9).

The role labels are positional, not derived from `champion_profiles` — a champion can be
annotated for several roles, so there is no reading of the data that assigns one per slot.
The profile roles do one smaller job: in the save dialog, a position's label goes gold when
that champion is annotated for it, which is a hint while sorting rather than a claim about
the row.

**The size constraint uses `cardinality()`, not `array_length()`.** `array_length('{}', 1)`
is `NULL` rather than `0`, so `array_length(champion_ids, 1) = 5` evaluates to `NULL` for an
empty array — and a CHECK that evaluates to `NULL` *passes*. An empty comp would have gone
straight in. `cardinality()` returns `0` and closes the hole. The migration's verify block
has an empty-array insert specifically to prove this.

**The size rule is duplicated in `validateDraftComp` on purpose.** The constraint protects
the data from anything that isn't this code; the validator produces a sentence a person can
act on instead of a Postgres constraint dump. The no-duplicate-champion rule is *only* in
the validator — `cardinality()` doesn't dedupe, so the database will happily store the same
champion twice, and one side of a draft cannot field a champion twice.

Both array columns are GIN-indexed because the contextual panel asks containment questions
(`champion_ids <@ …our picks` for "synergies we've already assembled", `&&` for partial
matches), which btree cannot answer. `loadDraftComps` exposes those as `containedBy` /
`hasAnyOf` / `hasAllOf` — named rather than passed through as operators, because getting
`@>` and `<@` backwards returns plausible-looking wrong rows rather than an error.

`deleteDraftTag` strips the slug from `draft_comps.win_conditions` as well as
`champion_profiles.tags`. The two vocabularies are separate by convention (`kind`) rather
than by constraint, so the cleanup is unconditional — a slug left dangling in an array
renders as a raw slug with no label, which reads as corruption.

## 13. The demo layer — three tables and fourteen views

Migrations 018 and 019. This layer stores **no facts about the game**. It is a mapping
from real identities to invented ones, plus a set of views that apply it. Delete every
row in it and the private app is unchanged; delete the views and only `/demo` breaks.

Why it is in Postgres rather than in the render layer is [04, §10](04-auth-and-security.md)
and [09, ADR-034](09-decision-log.md). What follows is the shape.

### The mapping tables

| Table | Key | Holds |
|---|---|---|
| `demo_aliases` | `player_id → players(id)` | `public_id uuid`, `alias`, `alias_slug` |
| `demo_opponent_aliases` | `opponent_id → team_opponents(id)` | same three |
| `demo_text` | `(source, row_id)` | `body`, `updated_at` |

All three are `authenticated`-only and granted to `anon` nowhere. `demo_aliases` maps a
puuid to an alias; published, it would undo the whole design in one request.

**`public_id` exists because `players.id` *is* the Riot puuid.** Exposing it would hand
out a stable, real Riot account identifier — worse than a display name, because it
survives renames and resolves against Riot's own API. Every view substitutes the
surrogate wherever a player is referenced, including in foreign keys, so nothing the
demo emits can be joined back to a real account.

**Both alias joins are inner.** A player or an opponent with no alias row does not appear
in the demo at all — and for opponents, neither do their series or games, which are
restricted through `demo_team_series`. Adding a roster member or a new opponent
therefore *hides* them until somebody writes an alias, rather than publishing them by
default. The default has to be the safe one, because the unsafe one is silent.

**`demo_text` is the only source of prose.** `source` names the surface, `row_id` is that
surface's id cast to text (the ids it points at are variously `uuid`, `integer` and
`text`). The views `left join` it, so **a row with no override renders no text at all**.
Current sources: `champion_profile`, `counter`, `comp`, `comp_label`, `opponent`,
`series`, `player_summary`, `player_summary_draft`, `team_summary`, `team_summary_draft`.

The last four are two texts in two states each — see §14 below.

### The views, and the criterion for a column

Every view lists its columns explicitly; `select *` would silently publish the next column
anybody adds to a base table. **Column names match the base tables exactly**, which is
what lets one loader serve both versions by swapping a table name rather than existing
twice ([07](07-frontend.md)).

That explicitness has a maintenance edge, and migration 020 is the first time it was paid:
adding `team_opponents.target_bans` did **not** add it to `demo_team_opponents`, so the
migration recreates the view. Recreating one is the moment to re-check what it exposes, so
020's verify block asserts both directions — the new column is readable as `anon`, and
`created_by` still is not.

| View | Identity replaced | Columns deliberately absent |
|---|---|---|
| `demo_players` | `public_id` as `id`, alias as both names, `'DEMO'` tag line | real `id` (puuid), `user_id`, `ai_context`, `ai_summary_enabled`, `synced_through`, `avatar_url` |
| `demo_matches` | — | **`riot_match_id`** |
| `demo_match_participants` | `public_id` as `player_id` | `puuid`, `riot_game_name`, `riot_tag_line` |
| `demo_player_rank_history` | `public_id` | — |
| `demo_champion_tier_lists` | `public_id` | `updated_by` |
| `demo_draft_tags` | — | — |
| `demo_champion_profiles` | — | `notes` → `demo_text` |
| `demo_champion_counters` | — | `note` → `demo_text`, `created_by` |
| `demo_draft_comps` | — | `label` **and** `notes` → `demo_text` |
| `demo_team_opponents` | opponent alias | `notes` → `demo_text` (`target_bans` passes through — champion ids carry no identity) |
| `demo_team_series` | opponent `public_id` | `created_by`, `notes` → `demo_text` |
| `demo_team_games` | — (already clean) | — |
| `demo_team_picks` | ally alias, or a positional label | the typed nickname |
| `demo_player_summaries` | `public_id` | everything else — it is a projection of `demo_text` |
| `demo_team_summary` | — (no identity in the row) | `source` and `row_id`, so no other `demo_text` row is reachable through it |

Four of those are worth the reasoning:

**`avatar_url` is dropped, not blanked, and not only because of the photo.** The Storage
object path is `${players.id}.${ext}` (`settings/actions.ts`), so the URL string itself
*contains the puuid*. The demo renders an initials tile derived from a hash of the alias
instead.

**`riot_match_id` is the single most dangerous column in the database for this purpose.**
It de-anonymizes the entire lobby in one step: paste it into any third-party site and all
ten Riot IDs come back, aliases or not. Everything else leaks one person; this leaks the
match.

**The three Riot-ID columns on `match_participants` cost nothing to drop.** Nine of every
ten rows belong to untracked strangers who never agreed to appear here, so their Riot IDs
are as much of a problem as the roster's — and those columns appear in **no `.select()`
anywhere in the app**, because untracked participants already render as champion icons
only. The join to `demo_aliases` is a `left` join for the same reason: an inner join would
drop the nine other rows and take every team composition with it.

**`draft_comps.label` goes through `demo_text` even though it is not a note.** It is a
free-text field the team typed, and it holds in-jokes. `compTitle()` already falls back to
the champion names when a comp has no label, so an un-overridden comp reads as its
portraits rather than as a gap.

### `demo_team_picks` and the label that has to be stable

`team_picks.player_name` is a nickname somebody typed — an enemy's, or an untracked
ally substitute's. Allies resolve through `demo_aliases`; everyone else gets
`'Rival ' || team_position` (or `'Sub '`).

The label is **positional rather than per-row on purpose**. `lib/team/stats.ts`
groups an opponent's history by `lower(player_name)` to derive their roster, so a per-row
label would split one enemy toplaner into one "player" per game and the derived roster
would be meaningless. Role plus side is the coarsest thing that keeps the grouping intact.

The cost is the other direction: an opponent who fielded two different toplaners across a
season collapses into one "Rival TOP". That is a real inaccuracy in the demo's scouting
page and it is listed in [10](10-known-gaps.md).

## 14. `demo_text` as a two-state row

Migration 019 adds one view:

```sql
create or replace view public.demo_player_summaries as
select a.public_id as player_id, t.body as summary_text, t.updated_at as generated_at
from public.demo_text t
join public.demo_aliases a on a.player_id = t.row_id
where t.source = 'player_summary'
  and length(btrim(t.body)) > 0;
```

Note `source = 'player_summary'` **and nothing else**. Generated text is written under
`source = 'player_summary_draft'`, and publishing is an upsert of both rows with the same
body. So one player's summary is up to two rows: what exists, and what is public.

This needed no schema change — `source` was already half the primary key — and it is the
only reason the review step in `/settings` is real rather than decorative. The
`length(btrim(body)) > 0` filter means clearing the published row is a valid operation:
it takes the card off the demo instead of rendering an empty one.

Migration 021 applies the same shape to the clan recap, which is one row rather than one per
player:

```sql
create or replace view public.demo_team_summary as
select t.body as summary_text, t.updated_at as generated_at
from public.demo_text t
where t.source = 'team_summary' and t.row_id = '1'
  and length(btrim(t.body)) > 0;
```

`row_id = '1'` because the private row it mirrors is the singleton `team_ai_summary.id = 1`.
No alias join, because there is no identity in the row to resolve — and note what the select
list leaves out: neither `source` nor `row_id` is a column of the view, so no other
`demo_text` row (a champion note, an opponent blurb, the *draft* recap) can be selected out
of it by changing a filter.
