# 09 — Decision Log

The load-bearing decisions, each as *context → decision → consequence*. Several of these
are **reversals** of what the original spec said, and those are the most useful ones —
they're the places where building the thing taught something the planning didn't know.

---

## ADR-001 — Sync to a database instead of calling Riot on page load

**Context.** Riot's personal key allows 100 requests per 2 minutes. Rendering a roster
page live would cost one call per player per view, and a match history would cost one per
match.

**Decision.** Sync on a schedule into Postgres. Pages read only from the database and
never touch Riot.

**Consequence.** Page loads are fast and cost nothing against the rate limit. Data is up
to 24 hours stale, mitigated by the manual Sync button. It also means the app owns its own
history — which turned out to matter enormously, because Riot exposes no way to recover a
player's past LP.

---

## ADR-002 — The Riot API key lives in the database, not in env

**Context.** Personal keys expire every 24 hours. As a Vercel env var, each refresh means
editing project settings and redeploying — every day, forever.

**Decision.** Store it in `sync_state.riot_api_key`, editable from `/settings`.

**Consequence.** Refresh is a form submit. The cost: the key is readable by any
authenticated user, since `sync_state` uses the blanket `authenticated_full_access` policy.
For a private app whose logins are all hand-created for five friends, that's acceptable.
In a multi-tenant app it would need a service-role-only table. **This is the one place the
app knowingly trades security for operability**, and it's the decision most worth being
able to defend out loud.

---

## ADR-003 — `players.id` is the Riot puuid

**Context.** Every entity needs an identity. Riot IDs (`name#tag`) are renameable; puuids
are not.

**Decision.** Use the puuid as the text primary key.

**Consequence.** `match_participants.player_id` can be compared directly against
`participant.puuid` during sync — no lookup table, no join, no mapping step. The price is
that a genuine account swap changes a primary key, which needs `ON UPDATE CASCADE` on
every FK plus an explicit history backfill (`backfillPlayerHistory`). A surrogate UUID
would have made that case cheaper and every sync insert more expensive; the sync path runs
daily and the account-swap path runs approximately never.

---

## ADR-004 — Excluded matches keep a `matches` row and get zero participant rows

**Context.** Remakes and short games must not count. But the incremental sync's stop
condition is "have I seen this match id?" — and an unrecorded id is one that gets
re-fetched on every future sync forever.

**Decision.** Insert the `matches` row with `excluded = true`; insert no
`match_participants`.

**Consequence.** The walk never re-fetches an excluded game, **and** the exclusion enforces
itself: every read path joins `match_participants!inner`, so a match with no participants
is structurally invisible to every query. There is not one `WHERE excluded = false` clause
in any page or read path — the only two in the codebase are in `refetchMatchDetails`, which
queries the `matches` table directly.

*Second-order consequence, worth stating because it looks like a bug:* `players.wins` is a
count of participant rows, so an excluded win isn't counted — but LP comes from Riot's
league endpoint, so the LP chart still moves. The graph can rise on a day the W/L record
doesn't.

---

## ADR-005 — `synced_through`, a contiguity cursor, not a high-water mark

**Context.** The original spec said: stop at the first already-known match. That's only
correct if everything below it is already stored. Two routine situations break it — a run
cut short by the time budget, and a player added after a teammate's sync recorded a shared
game. Both leave a **permanent** hole, because no future run will ever look below the
newest known match again.

**Decision.** Track the oldest `game_creation` a player's history is confirmed
*contiguous* down to. A known match only stops the walk when it sits at or below that
cursor; above it, the walk continues downward. The cursor advances only on a proven-complete
traversal.

**Consequence.** Interrupted runs resume correctly and partial runs are safe. The cost is
that the walk passes *through* known matches rather than halting, so the existence check
runs against every id on every page on every run — mitigated by batching it into one
`.in()` query per 20-id page. This is the most important correctness decision in the
codebase.

---

## ADR-006 — A sliding-window rate limiter, not a fixed delay

**Context.** The first implementation slept 75 ms between calls — ~13 req/s. Riot's
binding limit is 100 req/2min, which is **0.83 req/s sustained**. Off by a factor of 16,
and only surviving because the roster was small.

**Decision.** A `SlidingWindowLimiter` enforcing both windows simultaneously, shared at
module level by every Riot call, with `Retry-After` handling on 429.

**Consequence.** A Riot call now costs ~1.2 seconds of wall clock once the burst allowance
is spent. That single number cascades into everything: it's why Vercel's 60-second ceiling
permits only ~40–50 calls per run, why the sync needs a deadline, why partial runs had to
become a first-class outcome, and why any new feature adding Riot calls must be budgeted
against 40–50 rather than against the published limit.

The sliding direction is deliberate and provably safe: any fixed window is contained
within some sliding window, so respecting the limit slidingly guarantees respecting it
fixedly. The converse is false.

---

## ADR-007 — Stop early rather than risk being killed

**Context.** Vercel Hobby hard-caps functions at 60 seconds. A sync legitimately needs
more on a busy day.

**Decision.** Budget 50 seconds internally, and before every Riot call ask whether there's
time for it *including* the limiter's wait. Stop cleanly and report `partial: true`.

**Consequence.** The asymmetry that justifies the 10-second margin: an overrun is a hard
kill mid-insert; stopping early merely defers work to the next run. A partial run is
reported as a warning toast, never an error — because a backfill that reports plain success
while doing half the work looks stuck.

---

## ADR-008 — Refresh ranks before walking matches

**Context.** Both compete for the same 50-second budget.

**Decision.** Refresh every player's rank first, unconditionally, before any match walking.

**Consequence.** Ranks are the only part of the sync writing an unrecoverable time series
— Riot has no past-LP endpoint, so a missed day in `player_rank_history` is gone forever.
Missed match backfill is merely deferred; the data is still in Riot's API. **Do the
irreversible work first**, and it costs exactly one call per player.

---

## ADR-009 — Capture the whole participant DTO, not the 16 fields currently needed

**Context.** Riot's participant object has ~120 fields. The first version parsed 16 and
discarded the rest.

**Decision.** Store everything plausibly useful. Real columns for anything worth
aggregating or indexing; `pings` and `challenges` as jsonb; `challenges` whitelisted to
~13 keys.

**Consequence.** The governing asymmetry: **re-reading a match later costs another API
call; reading more of it now costs nothing.** Migration 005 plus a resumable backfill
action was the price of having got this wrong the first time.

The jsonb split has its own reasoning: ping counters come and go between patches
(`dangerPings` was removed once), so columns would mean a migration per patch. And the full
`challenges` object is ~2–3 KB per participant — ~30 KB per match — which would dominate
the database for stats nobody asked for.

---

## ADR-010 — `player_rank_history` as a separate append-only table

**Context.** The rank columns on `players` are overwritten every sync, and Riot offers no
way to recover past LP.

**Decision.** Append a row whenever the rank moved, or the newest point is over 20 hours
old.

**Consequence.** Unusually for a schema change, this one was **urgent** — every sync that
ran before it existed is a data point that can never be recovered. That's a legitimate
argument for shipping a table before the feature that reads it.

The two-armed append condition matters: without "changed", the manual Sync button fills
the table with identical rows; without "20 hours", a plateau leaves a gap in the graph.

---

## ADR-011 — AI summaries in one daily batch, not on page view

**Context.** The original architecture recommended lazy generation on view, guarded by a
`stale` flag. Gemini's free tier meters **requests per day**.

**Decision.** All generation happens in `/api/summaries`, on its own cron an hour after
the sync. Writers only set flags.

**Consequence.** Daily AI cost is fixed at **roster size + 1**, regardless of browsing.
Under the lazy model it scaled with how much anyone happened to open pages — five people
opening five pages after a session is 25 potential generations for data that changed once.

Knock-on effects: `/api/summary` (single-player, on-demand) was deleted; the Settings
"Regenerate now" button POSTs to the batch route rather than being a Server Action, so the
scheduled and manual paths are literally the same code under the same time budget and
`maxDuration`.

**This is a documented reversal of the original spec**, and the spec section that
recommended lazy generation now explains why it was wrong.

---

## ADR-012 — Per-player accounts, with display-name login

**Context.** Notes needed an owner. Supabase Auth has no username-only mode.

**Decision.** One `auth.users` row per player, created from Settings via the service-role
client (no public signup). Sign in with a **display name**, resolved to the linked
account's email by a `security definer` RPC callable by `anon`. Placeholder emails on the
RFC 2606 `.invalid` TLD.

**Consequence.** `display_name` becomes a login key, so it must be permanent and
case-insensitively unique — which in turn requires protecting it at column level. The RPC
is a deliberate, narrow hole in the auth wall: it returns only an email, only for a name
the caller already typed, and failure returns the same message as a wrong password.

---

## ADR-013 — Column grants for what RLS can't express

**Context.** `players.user_id` and `players.display_name` must not be writable by
authenticated users. RLS operates on rows, not columns.

**Decision.** `REVOKE UPDATE ON players FROM authenticated`, then re-`GRANT UPDATE` on
every column *except* those two.

**Consequence.** The trap this navigates: **a column-level REVOKE does not subtract from a
table-level GRANT**, and Supabase grants table-level UPDATE by default — so the table-level
grant has to be dropped entirely first. The ongoing cost is that any new writable column
must be added to that grant list or it's silently read-only.

---

## ADR-014 — Store ten participants per match, not one

**Context.** Only the tracked player's own line is strictly needed for a match history.

**Decision.** Store all ten.

**Consequence.** The nine "wasted" rows per match are what make lane matchups, the nemesis
stat, team-composition strips, and the full match breakdown possible — **at zero additional
API cost**, because the detail response contains all ten whether you parse them or not.
This is the same principle as ADR-009 applied at row level rather than column level.

---

## ADR-015 — Aggregate in JavaScript, not in Postgres

**Context.** Every stats page needs grouped aggregates over `match_participants`.

**Decision.** Select the relevant rows unbounded and fold them with pure functions in
`src/lib/*-stats.ts`.

**Consequence.** One database round trip can feed six different views — `/insights` fetches
once and derives duos, streaks, sessions, the tilt curve, the heatmap and the LP race from
the same array. Aggregation logic is plain testable TypeScript rather than SQL spread
across pages.

The cost is honest and acknowledged in the code itself: this does not scale. At five
players and a few hundred games it's a few thousand rows. `/insights` is explicitly named
as the page that will feel it first. **This is a scale-appropriate decision, not a
scale-free one**, and knowing which is which is the point.

---

## ADR-016 — Exclude games under 15 minutes, on top of Riot's remake flag

**Context.** `gameEndedInEarlySurrender` marks remakes and pre-15 surrenders. It does not
fire for a genuine 12-minute stomp, whose per-minute rates and KDA are distorted by how
little of the game was played.

**Decision.** Add a second, duration-based arm: `gameDuration < 900`. Both checks apply.

**Consequence.** Strictly *under* 15:00, so an FF15 surrender (~900–960s) still counts as
the real loss it is. The visible side effect — W/L totals dropping when migration 007 ran,
and the LP chart moving on days the record doesn't — was stated in the migration up front
rather than discovered later.

---

## ADR-017 — Every headline number is clickable

**Context.** An award tile, a heatmap cell, and a point on a curve are all the top of an
ordered list that got discarded during rendering. A roster-wide aggregate is exactly the
shape of number someone reads and thinks "that isn't me".

**Decision.** `rankPlayers` returns the full standings; `StatRankingDialog` shows them.
Each metric carries a plain-language definition, because a label like "Ward god" is a joke,
not a definition.

**Consequence.** No minimum-games gate is needed — the sample size is shown next to every
entry instead, so a leader off two games is visibly a leader off two games. **An aggregate
that can't be decomposed invites distrust.**

---

## ADR-018 — Semantic colors override the palette

**Context.** The original brief mandated a strict blue/navy/grey scheme, including
blue-for-win and grey-for-loss.

**Decision.** Use conventional green/red for win/loss, League's own tier colors for rank
badges, amber for key expiry, and a *separate* red for destructive actions.

**Consequence.** Four deliberate exceptions, all with the same justification: these are
colors whose meaning is already loaded in the user's head, and overriding it to satisfy a
palette costs more than it gains. The separate `--color-danger` exists specifically so
"you lost this game" and "this button deletes things" don't read as the same red.

Contrast was verified rather than eyeballed — that pass caught the earlier grey-based loss
color at ~3.1:1, below WCAG AA.

---

## ADR-019 — One deliberate technology non-choice: no service layer, no ORM, no state manager

**Context.** The conventional Next.js stack adds Prisma/Drizzle, a data-access layer, and
often React Query.

**Decision.** None of them. Server Components query Supabase directly; computation lives
in pure functions; there is no client-side data fetching to manage.

**Consequence.** Far less code and no cache-invalidation problem — `revalidatePath` is the
whole story. The cost is no compile-time checking of column names against the schema:
`.select("vision_score, …")` is a string, and a typo is a runtime null. Supabase's type
generation would close that gap and is the most defensible thing to add next.

---

## ADR-020 — Free tier as a hard design constraint, not a starting point

The through-line. Every constraint below produced a specific mechanism:

| Constraint | Mechanism |
|---|---|
| Riot 100 req/2min | Sliding-window limiter; ~1.2s/call budgeting |
| Riot key expires daily | Key in the database; validity flag; site-wide banner |
| Vercel 60s functions | Deadline guard; partial runs as a first-class outcome; resumable cursor |
| Vercel 1 cron/day | Sync and summaries as separate jobs, an hour apart |
| Gemini requests/day | Batch generation; fixed daily cost; stale flags |
| Supabase 500 MB | `challenges` whitelisted rather than stored whole |
| Supabase 7-day pause | The daily cron doubles as a keepalive |

Worth saying plainly: a system with money behind it would make different choices for most
of these. The engineering interest is in the constraint being *stated* and the mechanism
being *traceable to it* — not in pretending the constraints don't exist.
