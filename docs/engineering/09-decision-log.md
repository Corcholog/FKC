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
| Gemini requests/day | Batch generation; stale flags; a new-games floor before rewriting |
| Supabase 500 MB | `challenges` whitelisted rather than stored whole |
| Supabase 7-day pause | The daily cron doubles as a keepalive |

Worth saying plainly: a system with money behind it would make different choices for most
of these. The engineering interest is in the constraint being *stated* and the mechanism
being *traceable to it* — not in pretending the constraints don't exist.

---

## ADR-021 — Spend the AI quota on depth per summary, not on frequency

**Context.** Gemini's free tier meters *requests per day*; prompt size is effectively free
at any scale this app would send. Batching (ADR on §1 of [06](06-ai-layer.md)) had already
moved generation off page views, but the cost stayed at roster-size + 1 requests on any day
anyone played one ranked game. All of that budget went on frequency, which forced the
player prompt to stay thin: fifteen games carrying only KDA and CS, and no way to see a
pattern across them.

**Decision.** Invert it. `MIN_NEW_GAMES = 5` — a summary is only rewritten once five games
have been recorded since it was written — and the freed budget goes into a much richer
prompt: splits computed over the whole history, plus the last 30 games in full detail with
their notes attached.

The argument in one line: **a summary five games out of date is still true; a thin one is
vague every day.**

**Consequence.** A quiet day costs zero requests instead of one per player. Two new
mechanisms fall out of it:

- `force_regenerate` (migration 008), because `stale` can't distinguish "five more games"
  from "somebody wrote a note" — and a note *is* the input the summary most wants. Human
  edits bypass the floor; the sync doesn't.
- The threshold became user-visible. The card used to promise "refreshes on the next daily
  run", which the floor made false, so it now shows the count against the threshold and
  `MIN_NEW_GAMES` lives in `lib/summary.ts` where both the batch and the UI read it.

The cost is latency-to-freshness: a player who plays three games and stops keeps a stale
summary indefinitely. Recorded as intended in [10 §7](10-known-gaps.md).

---

## ADR-022 — The model narrates numbers; it does not compute them

**Context.** The obvious way to make the player summary better is to send more games. At
`gemini-3.6-flash` rates even a full history is a few cents a call, so cost doesn't forbid
it. But a model asked to aggregate across hundreds of raw rows produces confident, wrong
totals — "62% con Jinx" when it's 48% — and a wrong number in a summary is worse than a
vague one, because it reads exactly as authoritative as a right one.

**Decision.** Split the prompt. Everything about the long history is computed in TypeScript
(`lib/player-signals.ts`, composed out of the existing `player-stats` / `champion-stats` /
`matchups` / `sessions` / `streaks` modules) and handed over as finished numbers. Only a
bounded window — 30 games — is sent raw, for the game-to-game texture that aggregates
can't carry. The prompt states the division and forbids counting.

**Consequence.** Every number in a generated summary is traceable to a field on
`PlayerSignals` or a line in the window; anything else is a hallucination, which makes the
output *checkable*. Two corollaries enforced in the prompt builder: a field that wasn't
recorded is omitted rather than printed as `0` (nullable migration-005 columns), and the
overall record is counted from the same rows as the splits rather than read off
`players.wins/losses`, which is recounted at sync time and can disagree.

The tone change that prompted this work — objective analysis instead of roasting — is the
smaller half of it. Splitting `VOICE_INSTRUCTION` into a shared *language* constant plus
`RECAP_VOICE` / `ANALYST_VOICE` was enough for tone. The accuracy discipline is what
actually made a richer prompt safe to send.

---

## ADR-023 — The Riot key stays in the database, but the browser loses its grant

**Context.** ADR-002 put `riot_api_key` in `sync_state` so a daily key refresh is a form
submit rather than a redeploy, and accepted that "the key is readable by any authenticated
user" as the price. That sentence undersold it. `sync_state` carried
`authenticated_full_access` — `for all` — and the browser client ships the publishable key
by design, so any signed-in user could read the key from devtools with one line, and
overwrite or delete the row while they were there. The shared read-only *viewer* account
could do it too.

The gaps doc filed this under "no admin role". It isn't the same thing: an over-broad admin
UI lets a trusted person do something careless, whereas this handed out a live third-party
credential to anyone who opened a console.

**Decision.** Keep the key where it is — the operability argument still holds and the daily
refresh is real — and take the browser off the table instead. Migration 011 drops the
blanket policy for a select-only one, revokes all table privileges from `authenticated`,
and re-grants SELECT on every column *except* `riot_api_key`. Reads and writes of the key
now go through the service-role client, gated by `requireSession()` in the three actions
that need it.

Column grants rather than a view, because that's the idiom migration 002 already
established for `players.user_id` / `display_name`.

**Consequence.** `select("*")` on `sync_state` is now a permission error rather than a
leak — a tripwire, and the reason the three read sites must keep their explicit column
lists. `id` has to be granted despite never being rendered, since every read filters on it
and Postgres requires SELECT to filter.

What this does **not** fix: `/settings` is still open to every signed-in user, so anyone
can still rotate the key, delete a player, or reset another player's password through a
server action. That's the admin-role gap, it is still deliberate for a five-person group,
and it is now the *only* thing standing there — which is the point of separating the two.

---

## ADR-024 — Aggregate reads are paged, but aggregation stays in JavaScript

**Context.** Every stats page selects all relevant `match_participants` rows and folds them
in JS. The known-gaps doc framed that as a scaling problem for later. The nearer problem
was correctness: PostgREST caps every response at the project's "Max rows" setting (1000 by
default) and **truncates silently** — no error, no flag, no short-read signal.

The worst instance wasn't on a page at all. `refreshPlayerRank` counted a player's wins by
selecting every one of their rows and filtering in JS, then wrote the result to
`players.wins`/`losses`. Past the cap that persists a wrong record which every page then
reads back as fact.

**Decision.** Two changes, neither of which moves aggregation into Postgres.

1. Counts that were computed by fetching rows are now `count: "exact", head: true` queries.
   No row limit to hit, and no data moved.
2. Aggregate reads go through `lib/supabase/fetch-all.ts`, which pages with `.range()` and
   chunks over-long `.in()` id lists.

`fetchAllRows` strides by the number of rows actually returned and stops only on an empty
page. The obvious `page.length < PAGE_SIZE` termination check is wrong here: if Max rows is
set *below* PAGE_SIZE, every full page looks short, and the loop would stop after one — the
exact bug it was written to fix, reintroduced by the termination condition.

**Consequence.** Correct totals regardless of the project's Max rows setting, at the cost
of one extra empty round trip per aggregate read. Postgres-side aggregation is still the
right end state and is still unbuilt (gaps §2) — this makes the current reads honest, it
does not make them cheap. The distinction matters: those were being conflated, and only one
of them was urgent.

**A second bug found while verifying the first.** Checking `players.wins/losses` against a
live count turned up three of nine players off by exactly one game — at 93 total rows,
nowhere near any truncation cap. The cause was loop order in `runSync`: `refreshPlayerRank`
counts W/L and runs in the *first* loop, while new matches are inserted in the *second*. So
the totals were always as of before that same run's inserts, and the next run repeated it
for whatever was new by then. Not transient staleness — a player who games daily sat
permanently one sync behind in the dashboard's team winrate, the squad list and `/team`.

`runSync` now recounts W/L after the match loop for every player it found games for.
Recounting rather than reordering, because ranks-first is deliberate and unrelated (the LP
series is what can't be recovered on a blown budget), and these are Postgres counts that
cost no Riot calls.

Worth noting `summary.ts` had already noticed the *symptom* — it deliberately omits
`players.wins/losses` from the prompt because it "can disagree with a count taken from the
match rows right now" — and attributed it to normal between-sync staleness. That's real and
still true; it just wasn't the whole story, and the workaround meant nobody chased the
disagreement to its cause.

One deliberate exception. The navbar's lane prefill in `(app)/layout.tsx` reads a bounded
500-row sample rather than paging, because it's a mode over `team_position` and the mode of
a sample is the same lane as the mode of the history. It gained an `order("id")` at the
same time — a LIMIT without an ORDER BY is an arbitrary subset that Postgres may return
differently between calls, which would make the prefilled lane flicker between navigations.

---

## ADR-025 — Notifications push to Discord; the database stays the record

**Context.** Observability was one row. `sync_state.last_error` and a banner are both
*pull* signals: they require someone to go and look on a morning when nothing appears
wrong. A cron failing at 07:00 could go unnoticed for days, and an expired Riot key — a
roughly daily event — only surfaced once somebody opened the site.

**Decision.** A Discord webhook (`src/lib/discord.ts`) for state changes: sync failures,
Riot-key expiry, promotions and demotions, and the daily recap.

Three constraints, all load-bearing:

- **It cannot fail a job.** Every export swallows its own errors and carries a 5s timeout.
  A notification channel must not become a dependency of the thing it reports on.
- **It is optional.** No `DISCORD_WEBHOOK_URL` and every call no-ops.
- **It fires on state changes, not activity.** No LP deltas, no per-match messages. A
  webhook that fires forty times a day gets muted, and a muted webhook is worse than none,
  because it still looks like coverage.

Rank changes are *collected* during the sync into `SyncSummary.rankChanges` and sent by
`/api/sync` after the run's status is written, rather than posted from inside
`refreshPlayerRank`. That keeps a second failure mode and a second timeout out of the
middle of a time-budgeted loop, and keeps the database the authoritative record of what
happened.

**Consequence.** The gaps doc's §5 ("observability is one database row") is now half
closed: failures are pushed somewhere people actually read. Still missing, and still worth
having: structured logging, an error tracker, and a `sync_runs` history table instead of
one overwritten row.

---

## ADR-026 — Performance awards are scoped to the main role; counters are not

**Context.** The Hall of fame / Hall of shame tiles ranked the roster on whatever games
existed. A mid laner autofilled into support four times carried a support CS/min and a
support vision score into a comparison against people who queue that role every game, so
the tile answered "who got autofilled" rather than "who farms" or "who wards".

**Decision.** Split the dashboard into two aggregates over the same rows.
`aggregateMainRoleStats` counts only each player's modal `team_position` and backs every
metric derived from kills, deaths, assists, CS, vision or damage — KDA, CS/min, winrate,
damage/min, vision/min, deaths/game. `aggregatePlayerStats` stays unfiltered and backs the
counters: pentakills, steals, first bloods, games, pings, time dead.

The line is *skill claim vs. career counter*. A pentakill off-role is still a pentakill and
scoping it would hide a real game; an off-role CS/min is a measurement of a different job.

**Consequence.** Adjacent tiles now report different denominators, so the sub-text names
the scope (`"12 main-role games"` vs `"40 games"`) rather than leaving it implied. Main
role is a mode, not a declaration — nobody sets it in Settings, and it moves if someone's
queue habits do. Streaks stay unfiltered on purpose: a loss streak is a loss streak
whatever lane it happened in. `mainRole` also now backs `mainLane`, so the navbar's
prefilled matchup lane and the role the awards measure can't drift apart.

---

## ADR-027 — Private per-player AI chat is cut, not deferred

**Context.** Roadmap Phase 14 was a private chat with the AI agent, scoped per player. It
was the reason the docs kept flagging the auth model as provisional: the feature needed
real per-player identity, so `01_PRD.md`, `02_ARCHITECTURE.md`, `06_ROADMAP.md` and the
gaps doc all carried a forward reference to it.

**Decision.** Drop it. The AI in this app stays one-way and group-visible — scheduled
player summaries and a team recap, written on a cron and read by everyone.

**Consequence.** Nothing is stranded: the identity work shipped anyway in Phase 11 because
note ownership needed it (ADR-012, ADR-013), so per-player logins and owner-scoped RLS are
in production and load-bearing for `match_notes`. What changes is the docs — every
"future, when the chat lands" pointer is now a statement that it isn't landing, so the
next person reading them doesn't cost themselves a day designing chat tables. `match_notes`
is the only owner-scoped table this schema will need.
