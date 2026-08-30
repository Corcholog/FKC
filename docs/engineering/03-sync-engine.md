# 03 — The Sync Engine

This is the hardest part of the project and the part most worth being able to explain.
Four constraints collide here — Riot's rate limit, Vercel's function timeout, Riot's
lack of any "changed since" API, and the need for the result to be correct after an
interrupted run — and the design is essentially the resolution of those four.

Files: `src/lib/riot.ts`, `src/lib/rate-limiter.ts`, `src/lib/sync.ts`,
`src/lib/participant-row.ts`, `src/app/api/sync/route.ts`.

## 1. Riot's API: the two routing schemes

Mixing these up is the classic first bug against this API.

| Data | Routing | Value for LAS | Base URL |
|---|---|---|---|
| Match-V5, Account-V1 | **Regional** | `americas` | `https://americas.api.riotgames.com` |
| League-V4 | **Platform** | `LA2` | `https://la2.api.riotgames.com` |

LAS is `LA2` in platform-routed URLs. `LA1`/`LAN` is Latin America *North* — a different
server.

Four endpoints are used, and only four:

```ts
// src/lib/riot.ts
getPuuidByRiotId()   GET /riot/account/v1/accounts/by-riot-id/{name}/{tag}          (regional)
getMatchIds()        GET /lol/match/v5/matches/by-puuid/{puuid}/ids?queue&startTime (regional)
getMatchById()       GET /lol/match/v5/matches/{matchId}                            (regional)
getLeagueEntries()   GET /lol/league/v4/entries/by-puuid/{puuid}                    (platform)
```

`queue` filters server-side, so a walk for one queue never spends a detail call on
another, and normals/ARAM never cost a call or a row. `startTime` matters for the same
reason at a different scale: flex history reaches back years and the app tracks it from
June, so without a floor the walk would page through everything older to discover it
isn't wanted.

`getLeagueEntries` returns **every** queue the account is ranked in from one response, so
flex rank costs nothing on top of solo.

**The two routing schemes stopped being academic when the roster gained a BR account.**
BR and LAS are different platforms (`br1` vs `la2`, so rank is a different host) and the
same region (both `americas`, so match history and Riot ID lookup are not). `riot.ts`
throws on a platform it doesn't know rather than defaulting to `LA2` — that default
returns an empty entry list for a BR account, which reads as "unranked forever" with
nothing in any log to say why.

## 2. Rate limiting: the number that drives everything

A personal key allows **20 requests/second AND 100 requests/2 minutes**. Both are
enforced simultaneously.

The second one is the binding constraint, and the arithmetic is the thing to internalize:

```
100 requests / 120 seconds  =  0.83 req/s sustained  =  ~1.2 seconds per call
```

The burst limit (20/s) is almost never what you hit. An early version of this codebase
used a fixed 75 ms sleep between calls — that's ~13 req/s, which respects the *wrong*
limit by a factor of 16 and was riding entirely on the roster being small.

**The ~1.2s/call figure is what makes everything downstream hard.** Vercel's 60-second
function ceiling therefore permits roughly **40–50 Riot calls per invocation.** Not 100.
Any new feature that adds Riot calls has to be budgeted against 40–50, not against the
published rate limit.

### `SlidingWindowLimiter`

`src/lib/rate-limiter.ts`. A single class enforcing N windows at once.

```ts
const RIOT_LIMIT_WINDOWS = [
  { limit: 18, intervalMs: 1_000 },     // shaved from 20
  { limit: 96, intervalMs: 120_000 },   // shaved from 100
];
export const riotLimiter = new SlidingWindowLimiter(RIOT_LIMIT_WINDOWS);
```

Four design points:

**Sliding, not fixed, and that direction is the safe one.** Riot enforces a fixed
window; we enforce a sliding one. Any fixed 120-second window is contained within some
sliding 120-second window, so never exceeding the limit on a sliding basis guarantees
never exceeding it on a fixed basis. The converse is false — that's the classic
fixed-window burst problem where 100 calls at 11:59:59 and 100 more at 12:00:01 look
legal locally and get you 429'd.

**Both limits shaved (18/96, not 20/100).** Our clock starts when we *send*; Riot's
starts when it *receives*. That gap is exactly where an off-by-one 429 comes from.

**Acquisitions are chained, not concurrent.** Two callers racing would both observe "one
slot free" and both take it:

```ts
acquire(): Promise<void> {
  const next = this.chain.then(() => this.reserve());
  // Keep the chain alive even if one link rejects, or every later acquire
  // inherits that rejection forever.
  this.chain = next.then(() => undefined, () => undefined);
  return next;
}
```

That second line is a subtle bug-avoidance: without swallowing rejections, one failed
call poisons the promise chain permanently.

**`peekWaitMs()` exists for the deadline logic.** It reports how long the next
`acquire()` *would* block without reserving a slot — which is what lets the sync ask "is
there time for one more call?" before committing to one.

**The limiter is module-level.** Every caller in a serverless instance shares one budget:
the sync loop, the Settings backfill, and an ad-hoc Riot ID lookup all count against the
same key. This is correct *within* one instance and is the limitation to name honestly:
two concurrent Vercel instances have independent limiters. In practice the `sync_state`
lock (§7) prevents that for the sync path.

### 429 handling

`riotFetch` (`src/lib/riot.ts:39`) is the only place any Riot call is made, so it's the
only place pacing and recovery need to live. On a 429 it reads `Retry-After` (whole
seconds, occasionally absent), parks the *shared* limiter via `notifyRateLimited()` —
not just this one call — sleeps, and retries up to 3 times. After that it throws,
carrying `X-Rate-Limit-Type` in the message, because "application" (our own overuse)
versus a per-endpoint or Riot-side cap call for completely different fixes.

## 3. The time budget

```ts
// src/lib/sync.ts
const SYNC_BUDGET_MS = 50_000;      // route sets maxDuration = 60
const RIOT_CALL_BUDGET_MS = 2_000;  // ~1.2s limiter wait + request time, rounded up

class Deadline {
  hasRoomForCall(): boolean {
    return Date.now() + riotLimiter.peekWaitMs() + RIOT_CALL_BUDGET_MS < this.endsAt;
  }
}
```

The asymmetry that justifies the 10-second margin: **an overrun is a hard kill
mid-insert; stopping early just means the next run resumes.** So the run stops well
short of the ceiling rather than optimistically squeezing in one more call.

`hasRoomForCall()` includes `peekWaitMs()` because the question isn't "how long does a
request take" but "how long until I'm even allowed to send one".

**A partial run is a success, not an error.** `SyncSummary.partial` propagates up to the
navbar, which shows a warning toast — "Hit the rate limit — sync again to continue" —
rather than an error. If a backfill silently returned success while doing half the work,
it would look stuck.

## 4. Order of operations, and why ranks go first

```ts
// runSync, src/lib/sync.ts:120
for (const player of players) {
  await refreshPlayerRank(admin, player, apiKey);   // no deadline check
}
for (const player of players) {
  if (!deadline.hasRoomForCall()) { summary.partial = true; break; }
  await syncPlayerMatches(...);
}
```

Ranks are refreshed for every player *before* any match walking, and without a deadline
guard.

The reasoning is a data-loss asymmetry: **ranks are the only part of the sync that
writes an unrecoverable time series.** Riot has no "past LP" endpoint, so a day missed in
`player_rank_history` is gone forever. A day of missed match backfill is merely deferred
— the matches are still sitting in Riot's API and the next run picks them up. So the
irreversible work is done first, and it costs exactly one call per player.

## 5. The incremental walk — the correctness core

The naive algorithm (which the original spec proposed, and which is subtly wrong):

> Walk newest-first; stop at the first match you already have.

**That is only correct if you already have everything below it.** Two situations break
that assumption, and both happen routinely:

1. A run gets cut short by the time budget. It inserted matches 1–8 of a player's page
   but never reached 9–20. Next run sees match 1 already stored, stops immediately, and
   9–20 are lost *permanently* — no future run will ever look below match 1 again.
2. A player is added to the roster after a teammate's sync already recorded a shared
   game. That one game exists, so the walk stops at it, and the new player's real
   history is never backfilled.

The fix is a cursor: **the oldest `game_creation` this history is confirmed *contiguous*
down to.** Not "the newest match seen" — contiguity.

Since migration 023 it lives on `player_accounts`, and there are two of them —
`synced_through_solo` and `synced_through_flex`. Two rather than one because the queues
have different tracking start dates (`src/lib/queues.ts`), so a single value could not
describe both: it would either claim flex coverage back to July that doesn't exist, or
re-walk soloQ to June every run.

```ts
// src/lib/sync.ts:347 — inside the page loop
if (existingCreation) {
  if (syncedThrough && new Date(existingCreation) <= syncedThrough) {
    return await completeSync(admin, player, syncedThrough);  // proven covered → stop
  }
  continue;  // known, but above the cursor → keep walking to fill in beneath it
}
```

So an already-known match is only a stop signal when it sits **at or below the cursor**.
Above the cursor it's skipped and the walk continues downward. The cursor advances only
via `completeSync()`, which is reached in exactly three ways:

| Terminating condition | Cursor set to |
|---|---|
| Riot returned an empty page (out of history) | `TRACKING_START_DATE` |
| A match older than `TRACKING_START_DATE` was reached | `TRACKING_START_DATE` |
| A short page (< 20 ids) — end of history | `TRACKING_START_DATE` |
| An already-known match at/below the existing cursor | the existing cursor |

And it is **not** advanced when the walk stops on the time budget or the 200-match
pagination cap — those return `false`, which flips `summary.partial`. The invariant:
*the cursor only ever moves to a point whose coverage was actually proven this run.*

### One existence lookup per page, not per match

```ts
const { data: existingRows } = await admin
  .from("matches")
  .select("riot_match_id, game_creation")
  .in("riot_match_id", matchIds);   // all 20 ids at once
```

Because the walk deliberately passes *through* known matches rather than halting at the
first one, this check now runs against every id on every page on every run. One batched
query per 20 ids instead of 20 queries is what keeps that affordable.

### Pagination

`MATCH_ID_PAGE_SIZE = 20`, `MAX_MATCH_IDS_PER_PLAYER = 200`. The 200 cap is a safety
valve, not a target — hitting it returns `false` (not contiguous), so the next run
continues.

## 6. Exclusion rules

Two independent arms, both applied:

**`gameEndedInEarlySurrender`** — Riot's own per-participant boolean, true for remakes
and pre-15-minute surrender votes. It's a game-level outcome, so any participant having
it excludes the match. Using Riot's flag beats re-deriving it from duration, because
Riot has never publicly committed to the exact thresholds and they've shifted across
patches.

**`gameDuration < 900`** — and this is *not* a re-derivation of the flag. It catches a
category the flag was never meant to cover: a genuine 12-minute stomp. That game counts
for Riot and moves LP, but its per-minute rates and KDA are distorted by how little of
it was played, and a handful of them visibly skews every average over a roster-sized
sample.

Strictly *under* 15:00 matters: an FF15 surrender lands at ~900–960s, so it stays counted
as the real loss it is. Only games that ended before the 15-minute mark could arrive are
dropped.

Plus a tracked-queue membership test, even though the id query already filtered
server-side.

## 7. The route: locking and failure recording

`src/app/api/sync/route.ts`. Two things happen here that don't belong in `sync.ts`.

**Authorization accepts either identity.** A `Bearer ${CRON_SECRET}` header (Vercel
Cron) *or* a valid Supabase session (the navbar button). One route, two callers, no
special-casing beyond this.

**The lock is an atomic conditional UPDATE, not read-then-write.**

```ts
const { data: claimed } = await admin
  .from("sync_state")
  .update({ last_sync_status: "running", last_sync_started_at: now })
  .eq("id", 1)
  .or(`last_sync_status.is.null,last_sync_status.neq.running,last_sync_started_at.lt.${staleThreshold}`)
  .select("id");

if (!claimed || claimed.length === 0) return 409 "Sync already running";
```

Three things to notice:

- A read-then-write would race: two requests both read `'success'`, both proceed.
  Postgres serializes concurrent `UPDATE`s on the same row, so the conditional update is
  genuinely atomic — the loser matches zero rows.
- **`last_sync_status.is.null` is listed explicitly** because `neq.running` does *not*
  match NULL under SQL's three-valued logic. On a fresh install the column is NULL and
  the very first sync would deadlock itself without this.
- The `staleThreshold` arm (10 minutes) is crash recovery: a run killed by a Vercel
  timeout never gets to write `'error'`, so the `'running'` status would be permanent.

On completion the route writes `success`/`error`, the finish timestamp,
`riot_key_valid`, and `last_error`. That row is the entire observability story — the
dashboard and the settings page both read it, and the layout renders a site-wide banner
when the key is invalid.

## 8. Two more entry points into the same engine

**`backfillAccountHistory(admin, puuid)`** — one account, both cursors forced to `null`,
full walk from each queue's tracking start. Called whenever an account is attached to a
player, because nothing stored says anything about its coverage and waiting for the daily
sync to find it 200 ids at a time is not a backfill.

**`refetchMatchDetails(admin)`** — re-reads match detail for matches already stored and
rewrites their participant rows. Only needed after a migration widens what's captured
(005). Notable properties:

- Skips `excluded` matches — upserting would materialize the very rows the exclusion
  exists to avoid.
- Upserts on `(match_id, puuid)`, which **updates in place and preserves each row's
  `id`** — critical, because `match_notes` references those ids.
- Processes oldest-`fetched_at` first and bumps `fetched_at` as it goes, so an
  interrupted run leaves unprocessed rows at the front of the queue. **The index is the
  resume mechanism.**

## 8b. Two queues, one walk each

`syncAccountQueue(admin, account, queue, …)` is the old `syncPlayerMatches` with three
things parameterised: the queue id, the cursor column, and the tracking start. `runSync`
loops accounts × requested queues, skipping any account whose `track_*` flag for that queue
is false.

**The walk is ordered by `last_walked_at`, oldest first, and that is a bug fix rather than
a nicety.** The loop used to restart at the same player every run, which was invisible
while the tracking window was a few weeks — one run covered everybody. A backfill spanning
several runs, which is exactly what flex-since-June is, turns that into starvation: the
first account is walked five times and the fifth is never walked at all.

**A game the other queue's walk turns up is kept.** The exclusion rule tests membership of
every tracked queue rather than equality with the queue being walked, so stumbling on a
flex game during a soloQ walk stores and counts it instead of burning the detail call. The
other queue's cursor is untouched, which stays correct: finding one of its games says
nothing about its contiguity.

**`/api/sync?queues=` picks the scope**, defaulting to both — so the cron URL and the
navbar button need no parameter, and an unrecognised value degrades to "sync everything"
rather than to "sync nothing", which would look exactly like a working sync on a quiet day.
One lock still covers every queue: the rate limit and the 60-second budget are shared, so
two concurrent runs would spend the same allowance twice and both come back partial. Only a
queue that *finished* stamps its `sync_state.last_*_sync_at`.

## 9. Cost model

For N tracked players, one full sync costs:

```
N  league calls (rank)  +  N × ceil(new_matches / 20)  id-page calls
                        +  (number of genuinely new matches) detail calls
```

For 6 players on a busy day with 10 new games each: `6 + 6 + 60 ≈ 72` calls. At ~1.2s
each that's ~86 seconds — **which does not fit in one 60-second invocation.** So a busy
day legitimately produces a partial run and needs a second sync. That's the system
working as designed, and it's why the partial-run path had to be built rather than
treated as an edge case.

## 10. What the design deliberately does not do

- **No timeline endpoint.** Who gave up first blood, and gold/CS differentials at 10/15
  minutes, require Match-V5 timeline — a second call per match with a much larger
  payload. At ~1.2s/call that would roughly double sync cost. Not worth it.
- **No re-fetching of existing matches during a normal sync.** Match data is immutable
  once a game ends. `refetchMatchDetails` is the explicit, manual exception.
- **No webhooks or push.** Riot doesn't offer them. Polling once a day is the whole
  mechanism.
