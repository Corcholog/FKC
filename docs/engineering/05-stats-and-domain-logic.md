# 05 — Stats & Domain Logic

Everything the app *computes* lives in `src/lib/` as pure functions: plain rows in, plain
aggregates out, no I/O, no Supabase import. That constraint is the reason the same
aggregation code backs the dashboard tiles, the player page, and the AI prompts without
three copies drifting apart.

It's also the part of the codebase that would be trivial to unit test — and currently
isn't. See [10](10-known-gaps.md).

```
player-stats.ts    lifetime & per-role aggregates, awards, trends
champion-stats.ts  per (player, champion) aggregates for the tierlist
matchups.ts        lane opponents, nemesis
duo-stats.ts       who plays with whom, civil wars, synergy
streaks.ts         current / longest win & loss runs
sessions.ts        queue sessions, the tilt curve
time-stats.ts      hour × weekday heatmap, in Buenos Aires time
rank.ts            tier/division/LP ↔ sortable & plottable numbers
roles.ts           Riot's position strings → labels, order, main role, lane opponent
```

## 1. The aggregation conventions

These are the judgment calls that make the numbers honest. Each one exists because the
naive version produces a number that is technically computable and actually misleading.

### Deathless KDA divides by 1

```ts
export function kdaRatio(agg: PlayerAgg): number {
  return (agg.kills + agg.assists) / Math.max(agg.deaths, 1);
}
```

A zero-death aggregate is only reachable at very low game counts, but it divides by zero.
Treating it as one death is the same convention op.gg and friends use, and the same rule
is applied per-game in `format.ts:kdaRatioForGame` and per-champion in
`champion-stats.ts:championKdaRatio` — three call sites, one convention.

### Performance awards count the main role only; career counters count everything

The dashboard builds **two** aggregates off the same rows, because the tiles are two
different kinds of claim:

```ts
const mainRoleStats = aggregateMainRoleStats(flatAwardRows);   // performance
const allStats      = aggregatePlayerStats(flatAwardRows);     // career counters
```

| Scope | Tiles | Why |
|---|---|---|
| **Main role only** | Best/Worst KDA, Best/Worst CS/min, Highest winrate, Best damage/min, Ward god, Most deaths/game | Anything derived from kills, deaths, assists, CS, vision or damage. These are *skill* claims, and off-role games answer a different question. |
| **Every tracked game** | Objective thief, Pentakills, Most first bloods, Most games, Time spent dead, % of game dead, Most ? pings | Counters and volume. A pentakill off-role is still a pentakill — scoping these would just hide games that happened. |

The filter itself:

```ts
// aggregateMainRoleStats, src/lib/player-stats.ts
const roles = mainRoleByPlayer(rows);
return aggregatePlayerStats(
  rows.filter((row) => {
    const role = row.player_id ? roles.get(row.player_id) : null;
    return !role || row.team_position === role;
  }),
);
```

Main role is the **mode** over `team_position` (`roles.ts:mainRole`), ties breaking toward
the earlier role in `ROLE_ORDER` so the filter doesn't flip between renders. Games Riot
couldn't assign a role to don't vote, and a player whose rows carry *no* determinable role
keeps their whole history rather than vanishing from half the awards.

The reason for the split: a mid laner autofilled into support four times carries a vision
score and a CS/min from a role they don't play, and those numbers then compete against
people who queue that role every game — so the tile ranks who got autofilled rather than
who farms or wards well.

The cost is that the two kinds of tile show different game counts side by side, which is
why the sub-text says which it is: `"12 main-role games"` vs `"40 games"`, with the
standings dialog restating the scope in full.

Streaks are deliberately **not** scoped this way — a loss streak is a loss streak whatever
lane it happened in — so `streaksByPlayer` still reads the unfiltered rows.

`mainRole` is also what `lolalytics.ts:mainLane` prefills the navbar matchup lookup with,
so the lane the app assumes and the role the awards measure can't disagree.

### Support games are excluded from CS, on *both* sides of the ratio

```ts
if (!isSupport(row.team_position)) {
  agg.csGames += 1;
  agg.totalCs += row.total_cs;
  agg.csDurationSeconds += row.game_duration_seconds;   // its own clock
}
```

Support CS/min is structurally low. Folding those games in would drag down the CS/min of
anyone who fills support *some* of the time — punishing flexibility rather than measuring
farming. Note the separate duration accumulator: excluding the numerator but not the
denominator would be worse than not excluding at all.

With the main-role scoping above already in front of them, the two CS tiles use this rule
for one remaining job — keeping support *mains* out of the CS awards entirely (`csGames`
hits 0, and `rankPlayers` drops them) rather than letting them place last on a stat their
role doesn't have. The standings dialog says so: *"Support mains sit this one out."* The
rule still does its original work on the player page, where `aggregateByRole` and
`computeTrend` read unfiltered rows.

### Detail metrics average over the games that reported them

Migration-005 columns are NULL on rows synced before it. So:

```ts
if (typeof row.vision_score === "number") {   // the marker for "full detail row"
  agg.detailGames += 1;
  agg.detailDurationSeconds += row.game_duration_seconds;
  agg.totalVisionScore += row.vision_score;
  …
}
```

`vision_score` is used as the sentinel for "this row was synced with full detail" — it's
present on every real game post-005. Every detail-derived award gates on `detailGames`
and labels itself `"N games with full detail"`.

**The two-clock rule generalizes:** a per-minute rate must divide by the duration of the
games that reported its numerator. `visionScorePerMinute` divides by
`detailDurationSeconds`; `csPerMinute` divides by `csDurationSeconds`;
`damagePerMinute` divides by `totalDurationSeconds`. Getting this wrong is silent — the
number still renders, it's just wrong by whatever fraction of history lacks the column.

### Rates, not totals, wherever game count would win by default

Several awards come in pairs, and the pairing is the point:

| Raw total | Fair version | Why both |
|---|---|---|
| `minutesSpentDead` — "Time spent dead" | `deadTimeShare` — "% of game dead" | The raw total is a funnier number; the share is the one that isn't just "who plays most". |
| Vision score per game | `visionScorePerMinute` — "Ward god" | Vision score accrues over time, so a per-game total mostly measures game length. |

The dashboard ships both and says which is which in the standings dialog.

### Players with zero qualifying games are dropped, not scored zero

```ts
// rankPlayers, src/lib/player-stats.ts
const games = gamesFor(agg);
if (games === 0) continue;
```

Otherwise a support main with no farming games wins "worst CS/min" by default, and a
freshly added player with no games at all wins every "worst" award. An empty ranking
renders as an em dash.

The sort is **stable**, so players tied on a metric stay in roster order and the award
winner doesn't shuffle between renders.

### No minimum-games gate — the sample size is shown instead

There is deliberately no "minimum 10 games" threshold. Instead every tile carries its own
game count as sub-text, so a leader off two games is *visibly* a leader off two games.
For a five-person friend group, showing the honest number beats hiding a legitimate
result behind a threshold.

### Champion orderings are total, and tie-break on the record

Anything that ranks champions for one player — the player page's top-5 strip, the
`/champions` tierlist, and lane matchups — sorts through one of two shared comparators in
`champion-stats.ts`, so the three can't disagree about what "first" means:

```ts
byGamesThenRecord   // most games first; tie -> better record; tie -> championId
byWinRateThenGames  // best winrate first; tie -> bigger sample; tie -> championId
```

Three things this gets right that the naive `b.games - a.games` did not:

**With games equal, more wins *is* a higher winrate** — so the tie-break compares `wins`
directly. That's exact, where comparing rounded percentages would tie two genuinely
different records together.

**`byWinRateThenGames` cross-multiplies** (`b.wins * a.games - a.wins * b.games`) rather
than dividing. No float noise, and no `NaN` from a zero-game aggregate.

**Both end on `championId`, making the sort total.** Without a final tie-break, entries
with identical records fall back to whatever order the rows arrived in — which shows up as
arbitrary numbering beside the tierlist cards, and as ranks that can reshuffle when the
sort toggle is flipped back and forth.

This matters more than it sounds at this data volume: at ~15 games played, most of a
player's lane matchups sit on 1–2 games each, so **ties are the dominant case rather than
an edge case** — for one player, 11 of 13 matchup rows were tied on games. The tie-break
is effectively the primary ordering rule, not a fallback.

### Rankings return the full standings, not just the winner

`rankPlayers` returns the whole ordered array. The tile shows entry zero; clicking it
opens `StatRankingDialog` with everyone. The reasoning is stated in the code: *"why didn't
I get that award?" is only answerable next to everyone else's number.* Each award also
carries a `metric` string — a plain-language definition — because a label like "Ward god"
is a joke, not a definition.

### Trends need a baseline longer than the window

```ts
const comparable = recent.games >= window && lifetime.games > window;
```

Comparing the last 10 games against a lifetime that *is* those same 10 games always
yields zero. `delta` is `null` until there's genuinely more history, and the UI shows
nothing rather than a meaningless 0.

## 2. Rank math (`rank.ts`)

Two different numeric projections of the same rank, deliberately kept separate:

**`rankSortKey`** — lower is better, for list ordering:

```ts
tierIndex * 10000 + divisionWorseness * 1000 - lp
```

**`ladderPoints`** — higher is better, continuous, for the LP chart's y-axis:

```
1 division = 100 LP, 1 tier = 4 divisions = 400 LP
```

Choosing 100 LP per division makes tier boundaries land on clean multiples of 400, which
gives the chart free, meaningful gridlines instead of arbitrary ones.

Two edge cases handled explicitly:

- **Apex tiers.** Master/Grandmaster/Challenger have no divisions and unbounded LP, and
  GM/Challenger cutoffs are decided by ladder *position*, not LP. So all three share one
  band starting at `APEX_BASE` and are separated by raw LP alone. `formatLadderPoints`
  prints `"Master+ 340 LP"` above that line, because a value alone genuinely cannot name
  the tier.
- **Unranked returns `null`, not 0.** A gap in the series then renders as a gap, rather
  than a cliff-drop to Iron IV.

There are two formatters, and the reason is a nice detail:

```ts
formatLadderPoints(value)          // "Gold II"        — for axis ticks
formatLadderPointsDetailed(value)  // "Gold II · 47 LP" — for tooltips
```

A tick sits on a division boundary and naming it is the whole point; a tooltip points at
one real snapshot, where "Gold II" alone hides 99 LP of movement. They're two functions
rather than one with a boolean flag because **Recharts passes the tick index as the
second argument to `tickFormatter`** — an optional boolean parameter would silently turn
itself on from the second tick onward. That's the kind of API detail worth knowing about.

## 3. Roles (`roles.ts`)

Riot's `teamPosition` values are its own internal names: support is `UTILITY`, ADC is
`BOTTOM`. They're stored verbatim, and this file owns the raw strings — the same tradeoff
as storing Riot's champion codename and translating at the edge.

```ts
findLaneOpponent(participants, viewer)  // same team_position, different team_id
```

The enemy in the same lane is the closest thing to a direct opponent Riot's data offers
without the timeline endpoint. It returns `null` when Riot couldn't determine a position
— which happens on autofill and disconnects — and every caller handles that.

## 4. Champion naming: the DDragon translation layer

**Riot's `championName` in match data is the internal codename, not the display name.**
Wukong is `MonkeyKing`, Kai'Sa is `Kaisa`, Renata Glasc is `Renata`.

It happens to match DDragon's `id` field exactly, which is why *icon* URLs were always
correct. The display name lives only in DDragon's `name` field. So anywhere champion text
reaches a human, it goes through:

```ts
championDisplayName(championId, championMap, fallback)
```

Including inside AI prompts — `summary.ts` resolves names before building the prompt,
otherwise Gemini writes about "MonkeyKing".

Two more DDragon details:

- Both fetches use `next: { revalidate: 86400 }`, so the champion map costs one request
  per day across the whole app, not one per render.
- The champion list filters `key < 10_000`. As of patch 16.15 DDragon also carries ~60
  game-mode variants (ids prefixed `Jade_`, keys 60001–60117) that share their base
  champion's display name. They'd show as duplicates in the matchup picker and have no
  Lolalytics page.

## 5. Sessions and the tilt curve (`sessions.ts`)

The question isn't "how many games did you play" but **"how did the 7th game of the night
go compared to the 1st"** — the closest thing to a measurable tilt signal available
without the timeline API.

```ts
export const SESSION_GAP_MINUTES = 120;
```

A gap longer than two hours starts a new session. Two details:

**The gap is measured from the *end* of the previous game, not its start.** Otherwise a
50-minute slugfest eats most of the gap and splits a continuous session in half.

**Sessions are grouped per player, never roster-wide.** Splicing five people's evenings
into one timeline would manufacture a fictional 30-game marathon. `/insights` builds
`sessionsByPlayer` first, then flattens.

`winRateByGameIndex` buckets by 1-based position within a session, folding everything past
index 10 into the last bucket. Every point carries its own sample size, because the tail
is always built on fewer sessions than the head — and the chart says so.

`gameIndexByOwner` returns the same buckets split by whose sessions they came from, so a
dip at game 7 can be traced to the two people who actually play seven-game nights rather
than read as a clan-wide law of tilt. That feeds the click-through dialog.

## 6. Duos (`duo-stats.ts`)

Two tracked players in the same `match_id` are either on the same `team_id` (a duo) or on
opposite ones (a **civil war**). No extra Riot calls, no new columns — it's all derivable
from what's already stored.

```ts
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;   // order-independent
}
```

Canonical ordering is what stops a duo being counted twice under both orderings, and it's
also what makes `aWins` in a civil war unambiguous — it always refers to the same player
regardless of which row was read first.

A five-stack produces 10 pairs, and that's intended: each duo's record should count that
game.

**Synergy** compares a pair's winrate against the average of the two players' *solo*
winrates:

```ts
if (!soloA?.games || !soloB?.games) return null;
```

Null when either has no solo baseline. An unqualified "+40%" measured against a
nonexistent baseline is worse than saying nothing.

`MIN_DUO_GAMES = 3` — below that it's noise; two games at 100% is not a synergy. The
`/insights` matrix shows sub-threshold pairs but doesn't *rank* them.

## 7. Time (`time-stats.ts`)

```ts
export const ROSTER_TIME_ZONE = "America/Argentina/Buenos_Aires";
```

Bucketing is in Buenos Aires time — **not UTC and not the viewer's browser locale**. The
roster is on LAS; "games after midnight" has to mean midnight where they are or the stat
says nothing. This is the same zone `TRACKING_START_DATE` is anchored to in `sync.ts`.

`Intl.DateTimeFormat` with an explicit `timeZone` is the only way to get a wall-clock hour
in a fixed zone without a date library — `Date`'s own getters are always UTC or the host's
zone. One subtlety handled: `hour12: false` still renders midnight as `"24"` in some ICU
versions, hence `Number(hourRaw) % 24`.

The late-night window (00:00–06:00) is explicitly labelled as *not* a scientific cutoff —
it's "the window where one more game stops being a good idea". `/insights` always shows
it next to the rest-of-day winrate, because the number only means something against a
comparison.

## 8. Matchups and nemesis (`matchups.ts`)

Built entirely from the untracked enemy rows that nothing else reads. For each match,
find the tracked player, find the lane opponent, and accumulate **the tracked player's
own KDA** in that matchup (not the opponent's — you want to know how *you* did into
Zed, not how Zed did).

```ts
export const MIN_MATCHUP_GAMES = 3;
```

`nemesis()` picks the champion that beats this player most often: filter to a losing
record with enough games, then **most losses first, with winrate breaking ties** — so a
1–4 loses out to a 0–4 rather than the other way round. Sorting by winrate first would
crown a single 0–1 as the nemesis.

**The list has no natural ceiling.** One row per distinct lane opponent means it only ever
grows — a player who moves around the roster can face thirty or forty champions. In the
current data, four of nine players already exceed the list's 8-row default off ~15 games
each. So `MatchupList` shows the most-played few and puts the rest behind a "Show all N"
toggle, expanding into a fixed-height scroll region rather than growing the card: on the
player page it sits in a two-column grid beside the role split, and a thirty-row card would
break that layout. Silently slicing was the previous behaviour and the wrong one — a
truncated list that doesn't say it's truncated reads as the complete list.

## 9. Streaks (`streaks.ts`)

```ts
run = row.win ? Math.max(run, 0) + 1 : Math.min(run, 0) - 1;
```

One signed accumulator: a run keeps its sign and grows, a flip restarts it at ±1. Positive
is a win streak, negative a loss streak.

`computeStreak` **sorts its input itself** rather than trusting callers, with the comment:
*a streak read off insertion order is silently wrong rather than obviously wrong.* That's
the right instinct for any order-dependent aggregate.

`NOTABLE_STREAK = 3` — at 2 games it's noise, so the 🔥/💀 markers and badges only appear
from 3.

## 9b. Game length, map side, and the lane opponent

Three modules added together, all answering *when* or *against whom* rather than *how
well*, and all built from columns the sync already stores — no new Riot calls.

### `duration-stats.ts` — two readings of the same rows

A 55% winrate that is 64% under 25 minutes and 41% past 35 is a completely different
player from a flat 55%, and the difference is actionable: draft them something that
closes, or stop giving them scaling picks.

The module computes it twice, because the two readings fail differently:

- **`aggregateByDuration`** buckets into `15–25 / 25–30 / 30–35 / 35+`. Clean to read, but
  the long bucket is always the thinnest, and a 3-game bucket at 33% looks like a finding
  when it is a coin landing badly.
- **`winRatePastMinute`** is the cumulative curve: among games that lasted *at least* X
  minutes, how did they end. Marks at 15/20/25/30/35/40. Every point contains every longer
  game, so the sample shrinks gradually instead of being sliced into thin cells — and the
  shape shows *where* the decline starts rather than only that it exists.

**The floor is 15:00, not 0.** Migration 007 deleted the participant rows of every match
under 900 seconds, so there is no shorter bucket to build. That also gives a free
correctness check: the curve's value at the 15-minute mark must equal the overall winrate,
because every stored game clears it.

`MIN_DURATION_SAMPLE = 5` marks a point as unreliable rather than hiding it — the same
discipline as `Ranked.unranked` in `stat-ranking.tsx`. `durationSwing` returns the
first-to-last delta, or `null` when neither end has a usable sample.

### `lane-diff.ts` — the flat question a coach asks first

`matchups.ts` answers "which champions beat me". This answers "across every game, do they
come out of lane ahead or behind, and by how much" — gold, CS and damage against the
person standing across from them, via the same `findLaneOpponent` from `roles.ts`.

**Everything is per minute.** A 40-minute game produces bigger gaps than a 20-minute one
for reasons that have nothing to do with the player, so absolute totals would mostly
measure game length.

**Support CS diff is kept, unlike everywhere else.** `player-stats.ts` drops support games
from CS/min because it averages one player across every role and support farm drags the
number down (§1). Here the comparison is like-for-like — a support's lane opponent is the
enemy support — so the number means something. Two modules, opposite calls, both correct;
this is the case where copying the convention across would have been the bug.

`games` counts only matches where a same-role enemy was found. Riot leaves `team_position`
empty on some autofills, so that is strictly fewer than the games played, and the panel
says which number it is reading.

This is also the one place Phase 2 needed a query change: the historical-participant read
on the player page selected only kills/deaths/assists and now also takes `total_cs`,
`damage_dealt_to_champions` and `gold_earned`.

### `side-stats.ts` — honest about being nearly worthless in soloq

`aggregateBySide` splits on `team_id` (100 blue, 200 red) into games, winrate and average
duration.

In solo queue the side is **assigned**, so a gap is close to noise unless the sample is
large — `MIN_SIDE_GAMES = 100`, far above any other threshold in the codebase, and the
caption says outright that this is a curiosity. It is a module rather than four lines
inside the player page because the same two functions carry a real signal on the scrims
side, where the side comes out of a draft the team prepared for.

## 10. The pattern worth stealing

Every one of these modules has the same shape:

```ts
export type XInput = { …plain fields the DB already has… };
export type XAgg   = { …counters… };
export function aggregateX(rows: XInput[]): Map<string, XAgg>;
export function someMetric(agg: XAgg): number;
```

Structural typing does the heavy lifting: `XInput` describes the *columns needed*, not a
concrete row type, so a page can select one superset of columns and pass the same array to
`aggregatePlayerStats`, `streaksByPlayer`, and `aggregateByTime` without mapping between
shapes. That's why `/insights` can fetch once and derive six different views from it.

## 10b. Mixing sources: the unified row, and the third clock

Three records exist now — soloQ, flex, and team matches — and a page has to be able to
count any combination of them. That needed **no new aggregation code**, and the reason is
§10's pattern read one step further.

`src/lib/unified.ts` produces a row shaped like a `match_participants` row, snake_case
names and all. Every module above is structurally typed over those names rather than over
a nominal row type, so `aggregatePlayerStats`, `aggregateMainRoleStats`, `aggregateByRole`,
`streaksByPlayer`, `topChampionsByPlayer`, `championWinRate` and both champion comparators
apply to it unchanged. `lib/team/stats.ts`'s `toChampionStatInput` already proved this on
one aggregator; `unified.ts` generalises it.

**What a source cannot answer is `null`, never `0`.** A team match records no damage and no
vision. Zero is a real damage figure and would drag an average down; null means the game
doesn't answer the question.

That distinction is worth nothing without a clock to spend it on, so **damage got one** —
in `player-stats.ts` and `champion-stats.ts` both. This is §1's two-clock rule applied to
one more column, and it is the change most worth understanding, because getting it wrong
is silent: folding team matches into a damage average would divide a real numerator by
minutes that never contributed to it and halve everyone's DPM, with the number still
rendering. It is a no-op on Riot rows, which always report damage.

**Flex needed a rule about when it counts as *the team*, and that rule moved to write
time.** It used to be a three-way split at render — full stack, partial stack, civil war —
because any flex game with one tracked player was stored and each of those was a different
claim. The sync now keeps a flex game only when five of the main team were on one side
([03 §8c](03-sync-engine.md)), so two of the three can no longer be written: a partial
stack never lands, and five of the team on one side of a ten-player game leaves no room for
the team on the other. `src/lib/flex-team.ts` is gone; what survives is `groupFlexGames`
and `recordOf` in `src/lib/team/roster.ts`, and the numbers need no caveat.

**Riot-only panels stay Riot-only, at every scope.** LP over time, the hour heatmap, lane
differentials, matchups and the game-length curves read the Riot rows whatever the scope
asks for, and `SCOPE_CAPTIONS` names them. A team match has no LP, no kickoff time finer
than a date, no enemy laner resolved to an account and an often-missing duration — folding
it in would not widen those numbers, it would corrupt them.

## 10c. One row per game: `lib/team/history.ts`

§10b mixes sources to produce a *number*. This mixes the same sources to produce
a *list*, and the hard part is different.

`flex_participants` stores one row per player per game, so the roster's five-stack
arrives as five rows describing one game. The squad-wide feed at `/matches` renders those
as five rows and is right to: that list is told from a player's point of view, and each of
the five is somebody's game. `/team/matches` is told from the team's, so it folds them
into one entry — **the team played it once**.

Both records are flattened into a `HistoryEntry`, which carries only what the row shows:
two compositions, a result, a duration and a label. What differs between a scrim and a flex
game survives as three fields rather than as two code paths — `win` is `null` on a civil
war (the roster both won and lost it), `riotMatchId` is what a flex row links out with, and
`game` is the `TeamGameView` the panel opens in place.

**Ordering across the two is the subtle part.** A team match has no clock, only a date, so
it sorts at the midday key `teamMatchTimestamp` produces — the same one `fromTeamPick`
writes into `game_creation`, which is why it became a function rather than staying a
template literal in one file. And the merge relies on `sort` being **stable**: every game
of one series shares that single timestamp, so the incoming order is what keeps a
best-of-three contiguous and in playing order.

**`CompareBoard` is the reason the panel needed no second layout.** The role-paired board
under a draft was written against `TeamGameView`; it now takes two plain champion arrays,
so a hand-entered scrim and a Riot flex game render through the same component. It pairs by
role where a role is known and appends the leftovers rather than dropping them — Riot
returns an empty `team_position` often enough that a silently four-man composition is a
real outcome, and it looks like a plausible four-man composition rather than an error.

## 11. Team-match stats (`lib/team/`)

Same convention as everything above: pure, I/O-free functions over plain rows, called from
server components that fetch once and fold many times. `lib/team/queries.ts` is the single
read path and the only part that touches Supabase.

| Module | Answers |
|---|---|
| `team-stats.ts` | Overall record, blue/red split, by series type, head-to-head per opponent, per-player aggregates |
| `draft-stats.ts` | Pick and ban frequency per side, per-role pools, presence, the fearless pool |
| `opponents.ts` | An opponent's roster and pools, derived from nicknames |
| `filters.ts` | Which subset of games a question is about — see §11b |
| `team-splits.ts` | Game length and draft order at team level, adapting §9b's modules |
| `validate.ts` | What a submitted series must satisfy before it's written |

**These reuse the soloq helpers rather than re-deriving them**, which is the whole reason
`team_picks` is named the way it is. `aggregatePicks` sorts with `byGamesThenRecord`;
`toChampionStatInput` reshapes picks into `ChampionStatInput` so `topChampionsByPlayer` and
`championWinRate` apply directly. Anything that ranks champions therefore agrees with
`/champions` and the player page about what "first" means.

### A pick's result is its team's result

`team_games.win` is always *ours*. Every enemy-side aggregate negates it — `aggregatePicks`,
`toChampionStatInput` and `deriveOpponentRoster` each do this at the top of their loop. Getting
it wrong is invisible in the output (the numbers still look plausible) and inverts every
scouting conclusion, so it's stated once per function rather than assumed.

### CS/min averages only over games that recorded a duration

`duration_seconds` is nullable, and one game entered without it would otherwise drag
everybody's rate down by a fifth. `TeamPlayerAgg` carries `timedGames`/`timedSeconds`
separately, and `teamCsPerMinute` returns **null**, not 0, when nothing timed — the same
distinction §1's "detail metrics average over the games that reported them" makes, and for
the same reason: unknown isn't zero, and the page renders `—`.

### Presence counts picks and bans; both sides' bans

`championPresence` is `(picked + banned) / games`, so a champion banned by both teams every
game reads 200%. That's correct and intentional — presence measures draft relevance, not a
probability. Ban-only champions still appear, which is the point of the metric.

### Pick order isn't recorded, so nothing claims to know it

No blind-vs-counter, no first-pick champion. Side is stored and blue picks first, so
`hadFirstPick` is the whole of it. `/team/drafts` says this on the page rather than
letting the omission read as an oversight. ADR-028.

### Validation lives in `lib/`, not in the action

A `"use server"` module may only export async server functions, so validation written inside
the action is unreachable from anything else — including a test. `validate.ts` holds it and
`team/actions.ts` imports it, exactly as `normalizeTiers` relates to the tier list action.
The rule that catches most real mistakes is that a champion can appear at most once per game
across all twenty slots; fearless is deliberately *not* enforced server-side, because
organisers' rules differ and rejecting a legitimately-played game is worse than accepting an
odd-looking one. The form greys used champions out instead.

### Fearless removes picks, not bans

Within one game all twenty slots share a pool — no champion twice, and never both picked and
banned. *Across* games of a fearless series only the ten played champions are unavailable: a
champion banned in game 1 and never played can be picked or banned again in game 2.

`championsUsedInSeries` (saved games, here) and `usedEarlierInSeries` (the live form, in
`components/team/draft-form-state.ts`) implement this, and must agree — if they drift, the
form greys a champion that a saved series says is legal. Both exclude bans; `usedInGame` is
the within-game one and includes them.

## 11b. The scouting query (`filters.ts`, `team-splits.ts`)

Every module above answers one question over *every* recorded game. Preparation asks the
same questions over a subset — this patch, this opponent, officials only, games where they
had Maokai — so `filters.ts` is a `TeamMatchFilter` plus a predicate, and `/team/scouting`
(§15 of [07](07-frontend.md)) folds each aggregate over the filtered array.

**Champion filters are AND, and over picks only.** "We faced K'Sante *and* Maokai" is a
question about a composition; OR would return the union, which is nearly every game and
therefore no answer. Bans are excluded because a banned champion was never on the map, so
counting one as *faced* would attach a result to a game it took no part in.

**Options come from the unfiltered set, with unfiltered counts.** A dropdown rebuilt from
the current results is a dead end: choosing "official" would leave "official" as the only
kind and there would be no way back except editing the URL. Carrying each option's count
also makes an empty result legible as a combination that never happened rather than as a
broken page.

**A game with no patch recorded is excluded by a patch filter, not treated as a wildcard.**
"How did we look on 15.3" must not be answered partly with games nobody dated. That makes
the untagged count worth showing — and it was, at first, the whole dataset: the entry form
had no patch input, so nothing had ever written the column. It has one now, prefilled from
the DDragon version the form already loads (`patchFromVersion`), because an optional box
beside nine required fields gets skipped every time. Games entered before that stay null and
the dropdown says how many.

**A backwards date range is swapped, not rejected.** There is no reading of "from December
to January" that means the empty set, and silently matching nothing is the worst of the
three available behaviours.

`comparePatch` compares segment by segment as numbers, because `"15.10".localeCompare("15.9")`
is negative — a patch dropdown whose top entry is not the newest patch is wrong in a way
nobody checks. A non-numeric segment falls back to text so the comparison stays total
rather than collapsing to `NaN` and reporting equal.

### `team-splits.ts` — what scrims have that soloq doesn't

`teamDurationSplit` and `firstPickSplit` adapt §9b's modules rather than reimplementing
them, and the adaptation is the interesting part:

- **`team_games.duration_seconds` is nullable** (it is typed by hand and often skipped)
  and scrims have **no 15-minute floor**, unlike soloq where migration 007 deleted
  everything shorter. `aggregateByDuration` silently drops both. So the wrapper counts them
  as `untimed` and `tooShort`, and the caption states what the split is actually over. A
  length split over 40 games that quietly describes 26 is exactly the failure this codebase
  spends its comments avoiding.
- **Side means something else here.** In soloq it is assigned, which is why
  `MIN_SIDE_GAMES` is 100 and the caption calls it a curiosity. In a scrim it comes out of
  a draft the team prepared for, and blue picks first — so `firstPickSplit` reports the
  same partition under the name that makes it actionable: the first-pick record.
