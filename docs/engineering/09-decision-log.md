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

> **Superseded by ADR-044.** Kept as written: it was right for a roster where every
> person had exactly one account, and the reasoning below is still what makes
> `player_accounts.puuid` a primary key.

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

---

## ADR-028 — Scrims are entered by hand, because Riot cannot serve custom games

**Context.** The roster started playing university-tournament scrims and friendlies —
1-3 game blocks against fifteen-plus other universities, sometimes fearless. None of it
exists in `matches`, because the sync only asks Riot for `queue=420`.

The obvious first question was whether it *could* be synced. It cannot, on any route:
Match-V5 dropped custom-game support (a known custom matchId returns 404), its matchlist
`type` filter has no `custom` value, and the two endpoints that do carry customs —
`lol-rso-match-v1` and `tournament-v5` — both require an approved **production** key,
which additionally means tournament codes generated before every lobby. Riot's LoL policy
is explicit that custom match data may only reach a player through RSO. A private
five-person tracker will not be granted a production key. The evidence and links are in
`04_RIOT_API_INTEGRATION.md` §7.

**Decision.** A person types the draft in after the block. Roughly two minutes a game.

**Consequence.** This is a smaller loss than it looks. What matters for tournament prep is
the *draft* — what they pick, what they ban against us, how we do on blue versus red — and
a draft is about twenty champion selections, not a hundred stat fields. Draft patterns also
outlive patches in a way that per-game numbers don't.

What it does mean is that the entry form is the feature. If typing a game is slow, the data
stops arriving and every page downstream is empty; nothing here is recoverable later, unlike
soloq, where a missed sync just re-fetches. So the form is where the effort went: the ally
lineup is pre-seeded from the last series (falling back to each player's `mainRole`), sides
alternate automatically between games, and the champion picker greys out anything already
picked or banned in that game — and, in a fearless series, anything *played* earlier in it.

**Fearless carries picks, not bans.** Within one game all twenty slots compete for the same
pool: a champion can't be picked twice, banned twice, or picked and banned. Across games of
a fearless series only the ten *played* champions are removed — one banned in game 1 and
never played is still available in game 2, to pick or to ban again. This shipped wrong (bans
carried over too, on the reasoning that greying one champion too many was the safe
direction) and was corrected against how the roster actually plays. It isn't the safe
direction: it silently blocks a legal ban, and the person entering the game has no way to
override it. Some organisers do count bans; `usedEarlierInSeries` (live form) and
`championsUsedInSeries` (saved games) are the only two places that would change, and they
must always agree.

**What is deliberately not collected: pick order.** It would be ten more fields a game on
top of the draft and the K/D/A/CS, which is exactly the kind of weight that stops people
entering anything. The cost is that nothing can say who first-picked or who countered whom.
Side is recorded and blue picks first, so `hadFirstPick` is as close as this data gets, and
`/team/drafts` says so on the page rather than implying more precision than it has. Ban
*order* is kept, because you type bans in order anyway and it's free.

---

## ADR-029 — Scrims get their own tables, not a queue flag on `matches`

**Context.** Scrims are League games with ten participants, champions, roles and a result.
Reusing `matches` and `match_participants` with a queue id of 0 is the obvious move, and it
would have made `MatchRow` and every stat module work on scrims for free.

**Decision.** Four new tables — `team_opponents`, `team_series`, `team_games`,
`team_picks`. Reuse the *column names*, not the tables.

**Context for why the obvious move fails.** Three things, in increasing order of severity:

1. `matches.riot_match_id` is `unique not null`. A scrim has no Riot id, so every row would
   need a synthetic one, and the uniqueness that protects the sync from double-inserting
   would be protecting nothing.
2. `match_participants.puuid` is `not null`. Enemy university players have no known puuid
   and never will — they aren't Riot accounts we can resolve, they're a nickname somebody
   typed.
3. The real one: **every** soloq read path joins `match_participants!inner` with no queue
   filter. That's the dashboard's hall of fame and shame, `/champions`, `/team`,
   `/insights`, the player page, duo stats, streaks, sessions, the hour heatmap, the AI
   prompt builder and the Discord standings — around twelve modules that are correct today.
   Sharing a table means every one of them needs a filter added, and the failure mode of
   missing one is not a crash. It's a scrim quietly counting toward somebody's ranked KDA
   award, which nobody notices until the number is wrong and nobody knows why.

The two domains also answer different questions. Nothing on `/team` wants an LP graph, and
nothing on the dashboard wants a ban list.

**Consequence.** The reuse that was actually worth having is name-level, and it's total.
`team_picks.team_position` holds Riot's own `TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY` strings, so
`sortByRole`, `formatRole` and `mainRole` from `lib/roles.ts` take scrim rows with no
adapter — `sortByRole` is already generic over `{ team_position: string | null }`. And a
pick joined to its game is structurally a `ChampionStatInput`, so `topChampionsByPlayer`,
`allChampionsByPlayer`, `championWinRate`, `championKdaRatio`, `byGamesThenRecord` and
`byWinRateThenGames` all work unchanged (`damage_dealt_to_champions` is passed as 0 —
scrims don't record damage, and nothing renders a damage column for them).

Bans are `integer[]` on `team_games` rather than rows, following `match_participants.items`:
a ban carries no role and no player, the order is the data, and there are at most five a
side. Opponent *rosters* are derived from the nicknames on enemy picks rather than stored,
so scouting costs no extra entry step — the price is that a typo splits one person in two,
which is fixable by editing the series.

The soloq side of the app was not touched by any of this, which was the point.

## ADR-030 — Notes on a scrim game are an authored thread, not a text column

**Context.** ADR-029's tables shipped `team_games.notes`, a single `text` column, and the
entry form never grew a field for it — so a game's notes were rendered but unwritable. When
the ask came in ("users should be able to write notes on every scrim match"), the cheap fix
was to add the missing textarea and make it editable in place, the way `OpponentNotesForm`
edits `team_opponents.notes`.

That fix is wrong for this shape of data. A scouting note on an opponent is one team's
shared summary and genuinely wants one field. A scrim game is reviewed by five people who
all played it, on the same evening, after the same block. One column is last-write-wins:
two of them typing means one set of observations disappears with nothing to indicate it ever
existed. The app already had the right shape for this — `match_notes` is a thread of
authored rows — and the group already knows that UI from soloq match rows.

**Decision.** `team_game_notes`, mirroring `match_notes`. Migration 013 creates it, copies
any existing `team_games.notes` across (attributed to the series' `created_by`, keeping the
original `created_at`), and drops the column. In practice it copied nothing, since the column
was never writable — it runs the copy first because "I'm sure it's empty" is not a reason to
drop somebody's text.

Two departures from `match_notes`, both because a scrim isn't one player's game:

- **Anyone signed in may insert.** `notes_insert_own` gates on `owns_participant()`, because
  a soloq game belongs to exactly one tracked player. All five played the scrim; there is
  nothing to gate on.
- **No `author_name`.** That column is a pre-login legacy fallback. Authors here resolve
  through `players.user_id` at render time, so renaming a player relabels their whole
  history rather than stranding old notes under an old spelling.

**Editing stays author-only, which is the one place scrims break their own RLS rule.** The
other four scrim tables are `authenticated_full_access` on the explicit reasoning that
somebody has to be able to fix a typo in a draft they didn't enter. That reasoning covers
shared data and stops there: a wrong champion is everyone's to correct, a written opinion is
not. So notes get `select_all` + author-scoped insert/update/delete.

**Consequence.** The entry form finally gets its per-game note field, and what's typed there
becomes the first row of that game's thread rather than a separate entry-time field sitting
beside a thread that says the same thing. Notes load via `fetchAllByIds` on the two pages
that render them and nowhere else — prose feeds no aggregate, so `/team`, `/team/drafts`
and the scouting pages don't pay for it. `revalidateScrimNotes()` is likewise narrower than
`revalidateScrims()`: writing a sentence shouldn't recompute every stat on the site.

The cost is a migration that has to be run before the code is deployed. `notesByGame` throws
on a missing table rather than degrading to "no notes", which is deliberate — silently
swallowing a PostgREST error would make a transient database fault look exactly like
somebody's note having vanished.

**Follow-up (migration 014): replies, nested in the data and flat in the rendering.** Any note
can be answered, including a reply. `parent_note_id` stores the real target at whatever depth;
nothing collapses it on write, because rewriting a parent silently changes what somebody was
answering.

The first cut *did* collapse it — the action rewrote a reply-to-a-reply onto the thread root,
Slack-style, and only roots carried a Reply button. That was wrong twice over: it threw away
information the writer supplied, and it made a normal move ("no, I meant *your* point") simply
unavailable. The correct place for the constraint is the rendering, where the actual problem
lives.

So `threadNotes` flattens a thread to two visual levels: a root, then every answer below it in
time order, with `replying to <name>` on any whose target isn't the root. That's what YouTube
and Instagram do, and the reason is the container — a draft board carrying twenty champion
portraits, where a third indent level is unreadable on a phone. A name costs one line and
never runs out of horizontal space.

The reader is defensive because actions are reachable by direct POST:

- it walks to the root with a `seen` set rather than an arbitrary hop cap, so it terminates on
  a cycle without dropping the notes caught in it
- an unresolvable parent makes the note its own root — visible and wrong beats invisible
- **every note is assigned to exactly one thread.** The first implementation didn't enforce
  this, and a parent cycle produced two notes that were each other's replies *and* both roots,
  rendering each of them twice. Caught by the harness, fixed by excluding roots from the
  children map.

Deleting a note cascades recursively, so `descendantCount` is the whole subtree rather than the
direct children — the confirm dialog names that number. The alternative is answers orphaned
under a question nobody can read.

---

## ADR-031 — Champion annotations are an overlay on Data Dragon, not a champions table

**Context.** The draft tools need per-champion metadata the game doesn't supply: which lanes
this team plays a champion in, what it's *for* (engage, poke, wave clear), and a note. The
app has never had a champions table. Names, icons and the numeric id space come from Data
Dragon at request time (`src/lib/ddragon.ts`, 24h cache with an uncached retry on failure),
and `champion_tier_lists`, `team_picks` and `team_games.ally_bans` already store bare
`integer` ids with no foreign key.

The alternative — a `champions` table seeded from DDragon — is the obvious relational
answer and would have made every id a real reference. It also acquires a synchronisation
job: Riot ships a champion every few months, renames them occasionally (Renata Glasc), and
DDragon's list carries 60 game-mode variants that share display names with their base
champion. A seeded table is a copy that can be wrong, and the failure is silent.

**Decision.** `champion_profiles` holds only what DDragon cannot supply — `roles`, `tags`,
`notes` — keyed by the DDragon numeric key, with no foreign key and no name column. Rows are
sparse: `isEmptyProfile` is shared by the client and the action, so clearing a profile's last
field deletes the row rather than leaving an empty one. Every write validates the id against
`new Set(championMap.keys())` server-side, since a server action is reachable by direct POST
and not only through our own form.

**Consequences.** Nothing goes stale at patch time and nothing needs backfilling when Riot
ships a champion — the roster is whatever DDragon served this request. A champion Riot later
removes keeps its row and renders as a placeholder rather than vanishing.

The cost is that referential integrity for champion ids lives in application code on four
tables now instead of three, and one more place has to remember `new Set(championMap.keys())`.
That's the same bet this codebase already made twice, and it hasn't lost it. The second cost
is subtler: `champion_profiles.tags` stores `draft_tags.slug` strings rather than ids, so
renaming a tag's *label* is free but changing its slug would orphan every reference. The tag
manager doesn't offer slug editing, which is the whole reason that's safe.

---

## ADR-032 — Comps and synergies share one table with a `kind` discriminator

**Context.** The feature spec asked for two tables. A comp is one full side of a draft — five
champions — and a synergy is a combo of two to four. They have identical columns: label,
champion ids, win-condition tags, notes. The only difference is how many champions they hold
and what that count means.

**Decision.** One `draft_comps` table, `kind text check in ('comp','synergy')`, with
`draft_comps_size` tying cardinality to kind. Two list pages, one row type, one query module,
one form component, one save action.

The constraint uses `cardinality()`, not `array_length()`. `array_length('{}', 1)` is NULL,
a CHECK evaluating to NULL *passes*, and an empty comp would have slipped straight through.

**Consequences.** The seam where duplication would have hurt most is the one that never
existed: `loadDraftComps(supabase)` hands the reference panel every row of both kinds in one
call, and the panel's sections split on `kind` themselves. The board's two save buttons go
through one action. Phase 6 and Phase 7 both got cheaper because Phase 3 made this call.

Two costs, both real. The check constraint has two branches that have to be read carefully,
and its error message is a Postgres constraint dump — which is why `validateDraftComp`
duplicates the rule in prose, and also carries the no-duplicate-champion rule the constraint
can't express at all (`cardinality` doesn't dedupe, so the database will happily store the
same champion twice on one side).

And the day a comp needs a column a synergy can't have — per-slot roles, an `opponent_id`, a
side — this becomes a split. Nothing here makes that harder: the discriminator is one column,
the size rule is one constraint, and both list pages already query by `kind`. Split it then,
not in anticipation.

---

## ADR-033 — The simulator board is client state; only its outputs are persisted

**Context.** The board holds up to five games of ten bans and ten picks. Persisting it means
a fourth table, CRUD, a list page, and an ownership question nobody asked — five people share
one login-per-player app and any of them might open a board.

**Decision.** The board lives in React state, mirrored to `sessionStorage` (`draft-series-v1`)
so in-app navigation doesn't lose it, and gone when the tab closes. What persists is what the
team asked to persist: a comp, a synergy, or a PNG.

All of the board's rules live in `src/lib/draft/board.ts` as pure functions over plain objects
— what's in a slot, what can still be placed, what "earlier in the series" means — which is
what keeps the component a layout concern rather than a state machine.

**Consequences.** There is no draft state to migrate, version or garbage-collect, and the
board is genuinely disposable, which is what makes "any slot, any order" safe to offer. The
storage key was *bumped* rather than migrated when the single board became a series: a Phase 4
payload has `bans`/`picks` at the top level and would read as `series[0]` being undefined, so
`isStoredState` rejects it and the tab starts empty — the right outcome for a tab left open
across a deploy.

Rehydration happens **during render**, not in an effect. It can't go in `useState`'s
initialiser, which also runs on the server where `sessionStorage` doesn't exist, and an effect
trips `react-hooks/set-state-in-effect` — correctly, since that's a second pass after paint.
`useHydrated()` (a `useSyncExternalStore` whose server snapshot is `false`) plus adjusting
state during render is the sanctioned third option.

The cost is that a draft can't be shared or reopened tomorrow. If that turns out to matter,
the fix is a `draft_boards` table serialising the existing `SeriesBoard` type — `board.ts` was
written to make that straightforward, and `isSeriesBoard` is already the validator such a
table would need.

---

## ADR-034 — Anonymize in Postgres, not in the render layer

**Context.** A member of the group applied for a coaching role, showed this app as the tool
the group analyses itself with, and the hiring staff wanted to look at it. They obviously
cannot be given logins. The requirement that follows is not "the pages display aliases" —
it is *there must be no path by which a real name leaves the database*.

The obvious implementation is a mapping applied while rendering: fetch the real rows, swap
the names on the way out.

**Decision.** Do it in the database. `demo_*` views project the base tables with identity
replaced by a surrogate and sensitive columns simply **absent**, and `anon` is granted
`select` on those views and nothing else (migration 018).

**Consequences.** A render-layer mapping is a line of code, and a line of code can be
forgotten — silently, because the page still renders. A missing column cannot be
forgotten: selecting it is a `42703` error and the page breaks loudly. The proof this
matters already existed in the codebase — `player/[slug]/page.tsx` does `.select("*")` on
`players`, the widest select in the app. Against the view that is safe by construction,
and the loader needs no discipline at all.

It also means the guarantee holds for callers that are not this app. Someone hitting
PostgREST directly with the publishable key gets aliases, because that is all the role can
read — not because the frontend was polite.

The cost is that the views must be maintained alongside the tables: adding a column to
`players` does *not* add it to `demo_players`, which is the failure mode pointing in the
safe direction, and adding a demo-visible column means editing SQL rather than TypeScript.

Aliases themselves are **data, not code** — three mapping tables edited without a deploy,
so a name that turns out to be too on-the-nose is one `update` away.

---

## ADR-035 — One deployment with public routes, not a separate demo project

**Context.** The alternative shape is a second Vercel project pointed at a scrubbed copy of
the database, or a fork with fixtures.

**Decision.** One deployment. `/demo` is a public route subtree in the same app, with
`PUBLIC_PREFIXES` in the proxy and its own layout.

**Consequences.** One repo, one domain, one CI pipeline, and — the real argument — **no
drift**. A separate demo would have started identical and diverged with the first feature
that shipped to only one of them, which is the ordinary fate of demo forks. Here the demo
renders the same components as the private app, so a broken demo page is a broken page.

It also means the demo shows *real, current* data, which is most of why it is convincing:
a live roster's rank movement and champion pools read as a tool in use, and fixtures read
as a mockup.

The cost is that the blast radius of a mistake is the production app, which is exactly why
ADR-034 puts the boundary in Postgres rather than in a component.

---

## ADR-036 — Cache the data, not the page

**Context.** A demo link gets passed around a staff. Paying a Supabase read per visitor is
wasteful on a free tier, and `/demo/insights` reads the entire participant table.

The idiomatic answer is `export const revalidate = 3600` on the page.

**Decision.** `export const dynamic = "force-dynamic"` on every demo page, with
`unstable_cache` (1 hour, tag `"demo"`) around each loader instead.

**Consequences.** With no dynamic API in the tree, `revalidate` makes Next prerender the
page **at build time** — so `next build` would connect to Supabase. CI builds with a
placeholder project URL precisely because nothing should be contacted at build time, so an
ISR demo page turns a green pipeline red for reasons unrelated to the code. Caching the
data gets the property that actually matters (one read an hour, not one per visitor) with
no build-time database dependency.

`"use cache"` was the other candidate and needs `cacheComponents: true`, which changes the
rendering model for every existing route in the app — too large a change to make in
passing for the demo's benefit.

The constraint this introduces: **cache entries are serialized**, so a `Map` returned from
a cached loader comes back as `{}` on the second request. Every loader is therefore split
into `fetchXRows` (plain arrays) and a pure `buildX`. The bug it prevents is a nasty one —
the first request is a cache miss and works, so it looks correct locally and fails for the
second visitor.

---

## ADR-037 — Free text is published by explicit override, never by filtering

**Context.** Prose is the one thing projection cannot anonymize. A match note names people,
quotes them, and carries the group's slang; `clan_profile.context` literally describes
itself as holding inside jokes and nicknames.

**Decision.** No real text column appears in any view. The views `left join` a `demo_text`
table keyed on `(source, row_id)`, so **a row with no override shows no text at all**.

**Consequences.** The default is silence. Forgetting to write an override produces a blank
panel; a filter-based approach that missed a case produces a published in-joke. Given that
the reviewer of both outcomes is the person who wrote the joke, the first failure is the
one to engineer for.

`draft_comps.label` goes through the same gate even though it is not a note — it is free
text somebody typed, and `compTitle()` already falls back to champion names, so an
un-overridden comp reads as its portraits rather than as a gap.

Six tables get **no view at all**: `match_notes`, `team_game_notes`, `player_ai_summaries`,
`team_ai_summary`, `clan_profile`, `sync_state`. The last is the most important — it holds
the plaintext Riot key and a `last_error` in which Riot embeds puuids.

The measured cost, so it is not a guess: the demo loses 4 counter notes, 1 comp label, 5
comp notes, every match-notes panel, and the "Edited by X" line on tier lists. The draft
reference pages lose nothing, because nobody had written notes on them.

---

## ADR-038 — The demo's AI is a second prompt profile, not the same prompt with aliases

**Context.** The private player summary is written *for the person it is about*: it opens
with what their friends wrote, quotes their own match notes back at them, and answers "how
am I doing". Substituting aliases into that produces something that still reads as a
group's inside voice, addressed to nobody in the room.

**Decision.** `summary-analyst.ts` is a separate prompt profile over the same data.
`gatherPlayerPromptData` takes an optional alias map, and when it has one it does not fetch
match notes or AI context at all — the anonymization is in what the prompt is *built from*,
not in what the model is told to avoid saying.

Output is 4–5 scouting bullets in English rather than three paragraphs of Rioplatense
Spanish, because the audience skims it next to four others.

**Consequences.** The model cannot leak a note it was never shown, which is a stronger
guarantee than any instruction in a prompt. Verified offline against the assembled prompts
rather than the output: all nine carry their alias, zero note lines, zero hits against a
68-needle set.

Bullets also survive review better than prose — a claim per line can be struck out on its
own, where removing one sentence from a paragraph means rewriting the paragraph.

The demo's summaries are in English while the private ones are Spanish. One constant
(`ANALYST_DEMO_VOICE`) decides that; a Spanish paragraph inside an English demo would read
as an untranslated leftover rather than as a choice.

---

## ADR-039 — Generated public text lands in a draft row, and publishing is a second write

**Context.** `/api/demo-summaries` generates prose that appears on a page with no login in
front of it. The whole point of that feature is that a person reads it first.

The first implementation wrote generated text straight into `demo_text` under
`source = 'player_summary'` — which is exactly the row `demo_player_summaries` publishes.
Three summaries went live before anyone had read them.

**Decision.** Generation writes `source = 'player_summary_draft'`. Publishing is a button
in `/settings` that upserts both rows. `source` was already half the primary key, so this
needed no schema change.

**Consequences.** The review step is real rather than decorative, and the status line in
`/settings` reads the *published* row, never the textarea — so it can distinguish "live on
the demo" from "live, but not this version". Clearing the box and publishing takes the card
down, because the public view filters on `length(btrim(body)) > 0`.

Two supporting decisions fell out of the same bug report:

- The endpoint is **deliberately not on the cron**, unlike `/api/summaries`. A nightly job
  that rewrites public prose unattended is the exact thing this gate exists to prevent.
- A run fills in what is *missing* rather than walking the roster from the top, and reports
  `remaining`. Without that, a 60-second invocation that fits three generations rewrites
  the same first three players on every press. The per-call time estimate starts at 15s and
  is then **replaced by measurement**; it was a fixed 8s against calls that really take
  ~15s, so the loop kept starting a generation it could not finish and the work was lost
  when the platform killed the invocation.

Publishing calls `revalidateTag("demo", "max")`. Without it the 1-hour data cache from
ADR-036 means a freshly published summary appears on some pages and not others depending on
when each was last read — which is how the unreviewed-publication bug was noticed in the
first place.

---

## ADR-040 — The team view's filter is a URL, and it narrows in JavaScript

**Context.** Team statistics were asked for as "a section with its own picks and stats
together, and its own history with its filter". The filter is the requirement: every
existing scrim page already answers a question over *every* recorded game, and preparation
asks the same questions over a subset — this opponent, this patch, officials only, games
where they had a particular champion on the map.

Two independent choices fall out of that: where the filter state lives, and where the
narrowing happens.

**Decision.** The filter is `searchParams`, parsed by a pure `parseTeamMatchFilter`, and applied
by a pure predicate over the array `loadScrimGames` already returned. `TeamFilterBar` is a
client component whose only job is to `router.push` a new query string.

**Consequences.** A filtered view is linkable, which is most of its value — *"look at our
last three officials on red side"* is a thing you send to somebody, and a filter held in
component state cannot be sent. It also keeps every aggregate on the server in a pure
function, which is the convention the whole `lib/` layer rests on; the alternative would
have shipped every game's picks to the browser and duplicated the folds there.

Narrowing in JavaScript is consistent with ADR-015 and here it is not even a trade. The
section's pages all load the same complete dataset already, the demo copy shares one cache
entry with them, and a champion filter is a predicate over ten picks per game that SQL
would need a join to express. A filtered view therefore costs no extra read on either
version.

The costs, both real:

- **Every matching game renders.** There is no pagination, so a narrow filter is fast and
  a bare `/team/scouting` grows with the archive. Same shape as `/draft/counters` and listed
  in [10](10-known-gaps.md).
- **The champion filters are AND, and over picks only.** That is the right default — "we
  faced K'Sante *and* Maokai" is a question about a composition, and OR returns nearly
  every game — but it means there is no way to ask an either/or question, and no way to ask
  about a champion that was *banned*. Both are additions to `filters.ts` rather than
  redesigns, and neither was worth guessing at before somebody wanted it.

No migration. `team_series.kind` has distinguished `'scrim' | 'friendly' | 'official'`
since migration 012, which is the axis a tier-2 team actually needs — practice separated
from the games that counted — so the filter this ADR is about needed no new column.

---

## ADR-041 — A ban plan is a column, and it is not the ban history

**Context.** The scouting page already answers "what have they banned against us" and "what
have we banned against them", both from `team_games`. Neither is what a coach writes down
before a series. That is a *decision* — these three are coming off the board on Saturday —
and it was living in whatever chat the team happened to use, which is where prep goes to
die.

**Decision.** `team_opponents.target_bans integer[]`, ordered by priority, capped at five
(migration 020). One column, not a table, and deliberately separate from the ban history it
sits next to on the page.

**Consequences.** A plan has no attributes of its own: no author, no per-entry note, no
history. That is an array, and the same call `team_games.ally_bans` made in 012 and
`draft_comps.champion_ids` in 017. If a plan ever grows a reason per champion, *that* is
when it becomes a table; nothing here makes that harder.

Keeping it apart from history is the load-bearing half. The two are easy to conflate and
mean opposite things — one is what happened, the other is what we intend — and a page that
merged them would answer neither question. Instead they sit next to each other, and the
plan's rows carry the number that justifies them: *"they picked it 3×"*, from the same
`aggregatePicks` the pools below already use. A target they have never picked is not
necessarily wrong, but it is worth seeing before Saturday rather than after.

Two smaller calls:

- **The check constraint uses `cardinality()`, not `array_length()`** — `array_length('{}', 1)`
  is `NULL`, and a CHECK evaluating to `NULL` *passes*, so the empty-array case would sail
  through. Same trap as 017, and 020's verify block probes both the six-element case and the
  empty one rather than assuming.
- **The action re-validates against the live DDragon list**, because a server action is a
  POST endpoint and our own picker offering only real champions proves nothing about what
  arrives. It refuses outright when DDragon is down: cleaning an unknown list against an
  empty champion map would report success and silently wipe the prep.

The plan passes through to the demo unchanged — champion ids carry no identity, the same
reasoning that lets `demo_draft_comps` publish `champion_ids` while routing the label
through `demo_text`. It is also the only part of the scouting page that shows the tool being
used to *decide* something rather than to record something, which is worth a stranger seeing.

That makes `target_bans` the **only base-table column the demo renders directly** — every
other piece of prose on that page reaches it through `demo_text`. So saving a plan calls
`revalidateTag("demo", "max")`, exactly as publishing a demo summary does (ADR-039).
Without it the save would sit behind the hour-long cache from ADR-036 and read as not
having worked.

---

## ADR-042 — The demo's front page is the dashboard, and its recap is missing on purpose

**Context.** `/demo` opened on the roster grid — `/team`'s page, not `/`'s. That was the
shape the demo was built in: the roster is the cheapest page to anonymize, and the dashboard
was the one page still reading Supabase inline in a 760-line `page.tsx`, so it was the
expensive one to share. The result was a public demo whose landing page was a page the
private app doesn't land on, missing the award tiles, the streaks and the activity feed —
the parts a stranger would actually be shown to explain what the tool is.

**Decision.** Split the dashboard the way every other page is split — `fetchDashboardRows`
+ `buildDashboard` in `loaders/dashboard.ts`, `DashboardView` in `components/dashboard/` —
and give `/demo` the dashboard. The roster grid moved to `/demo/team`, so the public nav is
the private nav with a `/demo` prefix and the two are compared like for like.

**Consequences.** The demo's most expensive read (the whole participant history, for the
award tiles) is now on its landing page. That is what ADR-036's data cache is for: one read
an hour rather than one per visitor, and it is the same read `/demo/insights` already paid.

Three panels of `/` are absent, each by *not passing a slot* rather than by a branch inside
the view (§14): the sync card, match notes, and the clan recap. Only the last one is a
loss rather than a non-thing, and it is deliberate. Publishing a team summary would mean
publishing prose nobody reviewed, which ADR-039 exists to prevent — public text lands in a
draft row and a person presses Publish. The player summaries have that path; the team recap
doesn't, so the demo shows no recap at all rather than a cron writing to the internet. The
gap is recorded in [10, §7](10-known-gaps.md) instead of being papered over with the
private text.

The route move is the one externally visible change: a link to `/demo` that somebody has
already sent lands on the dashboard now, not the roster. Nothing 404s — `/demo/team` is a
real route with its own `loading.tsx` — and the dashboard is a better first thing to see,
which is why it is the front page in the private app too.

---

## ADR-043 — The demo's recap is a second prompt profile, and the anonymising happens in the gatherer

**Context.** ADR-042 shipped the demo dashboard without its recap card, and said why: the
private recap is written nightly in the group's own voice, opening with
`clan_profile.context` — 4000 characters of nicknames, in-jokes and running bits, the single
most identifying string in the database. There is no version of "publish that with the names
swapped" that is safe.

**Decision.** Do for the recap exactly what ADR-038 and ADR-039 did for the player
summaries: a second prompt profile (`buildAnalystTeamPrompt`), written to a draft row in
`demo_text`, published by a person. Migration 021 projects the published row as
`demo_team_summary`.

The load-bearing part is *where* the anonymising happens. `gatherTeamPromptData` is shared
by both recaps and **resolves every name inside itself**: handed an `AliasMap` it returns
aliases, and it drops any player who doesn't have one — so a duo or a head-to-head involving
an unaliased player disappears rather than falling back to a real name, the same inner-join
rule `demo_players` follows. What comes out is names, never ids, and no `AiContext` at all.

**Consequences.** `buildAnalystTeamPrompt` has nothing to substitute and no variable holding
the clan blurb. It cannot leak a name it was never given, which is the same property the
player profile has and is stronger than any instruction in the prompt. It also means the
private prompt kept its exact text through the refactor — the only thing that moved was
where the lines get built.

The view is the sharpest projection in the demo, and worth reading twice: it is a view over
`demo_text`, the one table that must never be public. `source` and `row_id` are **filtered
on but not selected**, so "exactly one row" is structural rather than a promise — with
either column exposed, a querystring filter would reach every draft and every override in
the table.

Two smaller calls:

- **Prose, not the player profile's bullets.** It lands in the same narrow sidebar card the
  private recap does and answers one question rather than five.
- **The demo page reads it with `optional()`, not `maybeRow()`.** A recap that fails to load
  costs the reader a card, not the page — the case `read.ts` describes. It also decoupled
  the deploy from the migration: before 021 ran, the view didn't exist, the read was a
  `42P01` in the log, and the dashboard rendered whole without it. That was verified in that
  order rather than assumed.

---

## ADR-044 — A player is a person; the accounts are rows

**Context.** ADR-003 made `players.id` the Riot puuid, and the reasoning held for two
years: one person, one account, and the sync could compare `match_participants.player_id`
straight against `participant.puuid`. Three things broke it at once — the roster plays flex
on accounts that are not the ones they solo queue on, somebody added a soloQ account on BR
while the rest are on LAS, and smurfs existed all along with nowhere to put them.

**Decision.** `players.id` becomes a surrogate `uuid`. `player_accounts` holds one row per
puuid, with its own platform, rank snapshot, per-queue cursors and per-queue tracking
flags. The sync resolves participants through a `puuid → player` map.

**Consequence.** The lookup ADR-003 was avoiding is now unavoidable, and it costs one Map
built once per run — which was never the real expense. Three things stay denormalised on
`players` rather than becoming joins: the primary account's Riot ID, the best soloQ rank by
`ladderPoints`, and `wins`/`losses` (still counted through `soloq_participants`, so flex
cannot inflate a rank badge). That is what let every rank surface in the app go untouched.

It also **retires the account swap**. Pointing a roster slot at a different Riot account
used to be an UPDATE of a primary key, which threw the old account's history away; it is an
insert now, and both are kept. ADR-003's `ON UPDATE CASCADE` machinery, and migration 022
which existed to fix a gap in it, are dead weight rather than load-bearing.

---

## ADR-045 — Flex shares the match tables; the queue filter becomes a view

**Context.** ADR-029 gave scrims their own tables, and its argument was not about shape —
it was that *every soloQ read path joins participants with no queue filter*, so shared rows
would poison a dozen modules where missing one produces a wrong number rather than an
error. Flex has the identical Riot payload, so separate tables would duplicate the sync
writer, the row mapper and every query. But the objection is exactly the same.

**Decision.** Flex rows go into `matches`/`match_participants` with `queue_id`
denormalised onto the participant row, and every existing read is pointed at a
queue-scoped **view** — `soloq_participants` — through `DataSource`, which already existed
to swap table names for the demo.

**Consequence.** The filter stops being something anybody has to remember: a page reads
soloQ because of which view it was handed. `privateSource()` defaults to `solo`, so every
page written before flex reads exactly what it read before, untouched. Two costs, both
named in [10](10-known-gaps.md): `select *` in a view is expanded at creation, so adding a
participant column means recreating three views; and eight reads bypass `DataSource` and
name the view by hand.

Team matches stay in their own tables regardless, and that is not inconsistency. A flex
game is a Riot match with a queue id and ten resolvable accounts. A team match has an
opponent, a draft nobody can recover from the API, no damage, and is typed in or read from
a `.rofl`. Same statistics, different records.

---

## ADR-046 — A unified row is shaped like a participant row

**Context.** Three sources of games, and a page that can count any combination of them.
The obvious design is a common interface with adapters on both sides, and a second set of
aggregators over it.

**Decision.** The unified row *is* a `match_participants` row — snake_case column names
included — and the existing aggregators take it as-is. What a source cannot answer is
`null`, never `0`.

**Consequence.** No new aggregation code, and no chance of the mixed numbers disagreeing
with the soloQ ones, because they are computed by the same functions. `lib/team/stats.ts`
had already proved this with `toChampionStatInput`; the only thing new is generalising it.

The `null` half is what made it honest, and it forced one real change: damage needed its
own clock in both `player-stats.ts` and `champion-stats.ts`. Without it, a mixed aggregate
divides a real damage total by minutes from games that never recorded any — DPM halved,
with the number still rendering. That is the same two-clock rule CS and the migration-005
detail metrics already followed, and it is a no-op on Riot rows.

---

## ADR-047 — A flex game counts as "the team" only at five

**Context.** Team-wide statistics mix team matches with flex. A team match is
unambiguous: one opponent, and `win` is ours. Flex is not — the roster queues as a five,
as a three with friends, and occasionally against itself.

**Decision.** Split flex three ways (`lib/flex-team.ts`). Five tracked players on one side
is the team and joins the team record. Fewer is some of the roster, and counts in the
per-player table only. Tracked players on both sides is a civil war and counts nowhere —
it is reported as a number and never as a result.

**Consequence.** The overview shows two numbers that count different things, and says so.
The alternative — treating any flex game with a tracked player as a team game — inflates
the record with games the team did not play and inverts on the civil wars, which is the
kind of wrong that looks plausible. The threshold is a constant (`FULL_STACK`) rather than
a setting, because "the team" is five people and that is not a preference.

