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
roles.ts           Riot's position strings → labels, order, lane opponent
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

The award tile says `"12 games · excl. support"` so the exclusion is visible, not hidden.

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
