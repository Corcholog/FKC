# 10 — Known Gaps

An honest inventory. For a portfolio project this page is an asset, not a liability:
knowing precisely what's missing and why is a stronger signal than a README that claims
everything is done.

## 1. No automated tests — the biggest gap

There is no test suite. CI (`.github/workflows/ci.yml`) runs `npm run typecheck`,
`npm run lint` and `npm run build` on every push and PR, which gates types and lint but
proves nothing about behaviour.

CI lints with the project's own `npm run lint` rather than `--max-warnings=0`, because
four pre-existing `next/no-img-element` warnings would make it red from its first run, and
a permanently red CI is indistinguishable from no CI. Clear those, then tighten it.

What makes this particularly worth fixing is that **the codebase is already shaped for
it.** Every module in `src/lib/*-stats.ts`, plus `rank.ts`, `sessions.ts`, `streaks.ts`,
`duo-stats.ts`, `matchups.ts` and `time-stats.ts`, is pure: plain rows in, plain aggregates
out, zero I/O. `src/lib/draft/board.ts` and `src/lib/draft/context.ts` were written to the
same rule and say so in their headers — no React, no Supabase, nothing async.

The highest-value tests, roughly in order. **The draft ones lead** because they are the
pieces of this codebase that go *silently* wrong rather than visibly broken: a fearless rule
that carries the wrong set still renders a board, and a counter lookup read from the wrong
end still renders a list of plausible champions.

| Target | What it pins down |
|---|---|
| `unavailableInSeries` | Bans don't carry between games, picks do, and "earlier" is `j < gameIndex` rather than `j !== gameIndex` |
| `conflictsAfter` / `releaseChampionAfter` | The forward half of the same rule, and that releasing strips one champion rather than clearing whole games |
| `assembledSynergies` / `nearSynergies` | Containment direction, and that a missing champion who is unavailable excludes the row entirely |
| `countersAgainst` / `countersFacing` | That both read `counteredBy` and only the pick list differs — backwards, this shows the enemy's answers as yours |
| `validateDraftComp` | Cardinality per kind, and the no-duplicate-champion rule the check constraint can't express |
| `indexCounters` | Both directions built in one pass, with no row counted twice |
| `ladderPoints` / `formatLadderPoints` round-trip | The apex-tier branch and the unranked-is-null rule |
| `SlidingWindowLimiter` (fake timers) | The chained-acquire race and the `notifyRateLimited` pause |
| `winRatePastMinute` | That each mark contains every longer game, and that a mark under `MIN_DURATION_SAMPLE` is flagged rather than plotted — the 15-minute point must equal the overall winrate |
| `laneDiffForPlayer` | That `games` counts only matches where a same-role enemy was found, and that support CS diff is kept here while `player-stats.ts` drops it |
| `computeStreak` | The signed-accumulator flip, and that it sorts its own input |
| `groupIntoSessions` | Gap measured from game *end*, not start |
| `aggregateDuoStats` | Canonical pair ordering; five-stack → 10 pairs |
| `aggregatePlayerStats` | The `detailGames` split and the two-clock per-minute rule |
| `mainRole` / `aggregateMainRoleStats` | Mode over `team_position`, the `ROLE_ORDER` tiebreak, and the no-role-at-all fallback |
| `nemesis` | Most-losses-first with winrate as tiebreak |
| `toParticipantRow` | `undefined` → `null` normalisation for missing Riot fields |

The sync walk itself is the one piece that needs real design work to test — it takes a
`SupabaseClient` directly, so testing it means either a fake client or extracting the walk
logic from the I/O. That extraction is worth doing anyway.

## 2. No Postgres-side aggregation

Every stats page selects all relevant `match_participants` rows and folds them in
JavaScript. At five players and a few hundred games that's a few thousand rows and it's
genuinely fine. It breaks down when either the roster or the history grows by an order of
magnitude.

The migration path is clear: materialized views or RPC functions for the aggregates,
keeping the same `XAgg` shapes so the rendering layer doesn't change. The front page is
the one to convert first — the roster board aggregates over the entire participant table
for all five players, and now folds it a second time for the hour chart.

**Budget for `statement_timeout` when doing it.** The `authenticator` role this project
runs under is configured with `statement_timeout=8s` and `lock_timeout=8s`:

```sql
select rolname, rolconfig from pg_roles where rolname = 'authenticator';
-- {session_preload_libraries=..., statement_timeout=8s, lock_timeout=8s}
```

Paged reads are unaffected — each page is its own short query, so paging is *safer* here
than one large select. But a single aggregate RPC or a `refresh materialized view` over the
whole participant table is exactly the shape that hits an 8s ceiling, and it fails as a
query error at request time rather than as slowness. Anything moved server-side wants
either an index that keeps it well under, or a scheduled refresh running as a role without
that cap.

**What was fixed, and what wasn't.** This entry used to say "unbounded", and that was a
correctness bug hiding behind a scaling note. PostgREST truncates every response at the
project's "Max rows" setting (1000 by default) *silently* — so a big enough history didn't
make these pages slow, it made them wrong, with no signal. Worse, `refreshPlayerRank`
counted wins the same way and **persisted** the wrong total to `players.wins`/`losses`.

Those reads now go through `lib/supabase/fetch-all.ts` (paging plus `.in()` chunking) and
the counts are `head: true` count queries. See ADR-024. That makes the reads honest; it
does **not** move the aggregation, so everything above still stands.

## 3. No generated database types

`.select("player_id, team_position, win, …")` is a string. A typo or a renamed column is a
runtime `undefined`, not a compile error. Types are hand-declared per page:

```ts
type ParticipantRow = { id: string; match_id: string; /* … */ };
```

`supabase gen types typescript` would close this, and it's the single highest
value-per-effort improvement available. It would also have caught the stale
`scripts/validate_palette.js` class of drift described in §6.

## 4. No admin role

`/settings` is open to every signed-in user. That means any player can add or delete roster
members, rotate the Riot key, remove another player's login (including deleting their
`auth.users` row), set another player's password, and edit the team AI context. Several of
those actions take a plain string argument, so they're invocable as bare server-action
POSTs without going near the UI.

This is deliberate for a five-person team and is flagged in the roadmap as "not
done, deliberately". It's also the first thing that must change if the app is ever shared
beyond people who already trust each other completely — probably as a `players.is_admin`
column plus RLS on the mutating paths.

This used to be entangled with a second, worse problem: `sync_state` carried a `for all`
policy for `authenticated`, so any signed-in user could read the plaintext Riot API key
straight out of the browser console. That was credential exposure rather than an
over-permissive admin UI, and migration 011 closed it (ADR-023). What's left here is the
genuine admin-role gap and nothing else.

## 5. Observability is a database row plus a webhook

No structured logging, no error tracking, no metrics.

A failed sync and an expired Riot key now push to Discord (`src/lib/discord.ts`, ADR-025),
which covers the case this entry was really about: a cron failing silently at 07:00 with
nobody looking at `last_error`. Promotions/demotions and the daily recap go the same way.

Still missing: structured logging, an error tracker, and a `sync_runs` history table
instead of one overwritten row — there is still no way to answer "how long has this been
failing?" or "when did this last succeed before today?".

## 6. Small known inconsistencies

**`scripts/validate_palette.js` doesn't exist.** `chart-theme.ts` tells you to re-run it if
you change `SERIES_COLORS`:

```ts
//   node scripts/validate_palette.js "<hexes>" --mode dark --surface "#10151d"
```

There is no `scripts/` directory. The validation was clearly done, but the tool wasn't
committed — so the instruction can't be followed. Either commit the script or drop the
line.

**`docs/05_DESIGN_SYSTEM.md` is stale.** It documents the original blue/navy palette
(`--color-blue-primary: #3B82F6`, blue-for-win, grey-for-loss). The app now ships a hextech
gold/cyan theme with green/red win/loss. `src/app/globals.css` is the real design system;
that doc is a planning artifact. (This is part of why the planning docs stay unpublished —
see this folder's README.)

**Player slugs aren't stable.** `slug` is regenerated from the Riot ID on rename, so
`/players/[slug]` URLs break when someone changes their name. Harmless internally; would
matter if anything ever linked in from outside.

**The team crest is a placeholder.** `Crest()` in the navbar renders a styled `FC` div, and
`public/` is empty.

**Avatar upload isn't validated.** `settings/actions.ts` takes `file.type` from the client
verbatim as the stored `contentType`, derives the file extension from the untrusted
filename, and enforces no size cap or MIME allowlist — into a *public* Storage bucket. An
`image/svg+xml` or `text/html` upload is stored XSS on the Supabase storage origin. Small
fix, not yet done.

**No security headers.** `next.config.ts` sets `images.remotePatterns` and nothing else —
no CSP, `X-Frame-Options` or `Referrer-Policy`, and `poweredByHeader` is left on.

**`/prep/counters` has no pagination.** It renders one card per champion the team has noted
answers *to*, and the underlying loader pages properly, so the page grows with the notes. The
combobox and role filter are what keep it usable; past a few hundred annotated champions
neither is enough. `/prep/champions` has the same shape but a fixed ceiling — there are only
~170 champions.

**`/prep/scouting` renders every matching game.** Same shape, one level worse: an unfiltered
visit draws the entire archive as full draft cards. The filter is what keeps it usable, and
the page is *for* filtering, so this is fine at a season's worth of games and won't be at
five. The fix is the pagination the soloQ view of `/matches` already has (ADR-024's
`parsePage`), applied to the "Matching games" list only.

**The eight scrim games entered before the patch field existed have no patch.** The entry
form had no such input at all until then, which is why `/prep/scouting`'s patch filter had
nothing to filter — the column shipped in migration 012 and nothing ever wrote it. The form
now carries a patch per game, **prefilled from the current DDragon version**, so this closes
going forward; the existing eight stay null until somebody edits those series, and the
filter names the untagged count rather than pretending they belong to a patch.

The prefill is the part that matters. An optional text box beside nine required fields gets
skipped every time — that is the entire history of this column — so the fix was a default,
not a field.

**The reference panel's two-column layout rests on an unenforced numeric coupling.** The
sections switch to two columns at a container query of `@md` (28rem), which works only
because the docked panel is `w-[30rem]` and the sheet below `xl` is `max-w-sm` (24rem). Narrow
the panel past 28rem and the layout silently collapses to one column; widen the sheet past it
and a phone gets two. Three numbers in two files with nothing tying them together.

**`TagMultiSelect` is the app's only multi-select and isn't a general primitive.** It assumes
a `{ slug, label }` shape and a `DraftTagKind`, and it's wired to the tag creation action. The
next thing that needs multi-select will either bend it or write a second one.

**No `Suspense` or `next/dynamic` anywhere.** Every route uses `loading.tsx`, so the whole
page is withheld until the slowest query resolves rather than streaming in parts. recharts
and `@dnd-kit` are statically imported into client bundles.

**The match-row assembly used to be copy-pasted three times** — the `toChampion` +
`allies`/`enemies`/`opponent` + `participantsByMatch` block, its byte-identical 14-column
select, and a verbatim `ParticipantRow` in each of `page.tsx`, `matches/page.tsx` and
`player/[slug]/page.tsx`. `src/lib/match-rows.ts` owns all of it now. Both entries are
closed; the underlying reason they were dangerous — no generated database types, §3 — is
not.

## 7. What deleting the demo closed, and what it didn't

`/demo` is gone (ADR-050, migration 027), and with it every gap this section used to list:
the untested leak checks, the un-aliased opponent rosters, the summaries that went stale
silently, the fixture path that never existed.

Worth recording what it actually cost while it was here, because the number is the argument
against building one again casually. The views were cheap. The expensive part was the
invariant they created — **every page needed an anonymized twin**, built from the same view
component with the unsafe slots omitted rather than behind a `demo` boolean, or the public
half silently fell behind. That is a tax on every route the app will ever add, and it was
being paid for a surface with no audience.

What it leaves behind:

**The slot pattern outlived its reason.** `notesFor`, `actionsFor`, `summary`, `recentForm`,
`syncStatus` and `recap` are all render props rather than flags because a flag would have let
the public copy render something it shouldn't. Nothing public exists any more, and they are
still the right shape — a page that has no note threads passes no function — but the
*argument* in their headers is now historical, and a future reader should know that a plain
boolean is no longer a security question.

**No published fixture data.** There is still no way to develop against a plausible roster
without a real one in the database.

## 7b. What flex, multi-account and team matches left open

**None of it is tested, and it is the change most able to go silently wrong.** Queue
scoping, puuid→player resolution and the flex gate all fail by producing a plausible number
rather than an error — and the gate now fails by *not writing a row*, which is worse: a
game rejected because the roster was misconfigured is not recoverable by re-running the
sync, only by clearing marker rows. The pure modules — `queues.ts`, `scope.ts`,
`unified.ts`, `team/roster.ts`, `team/history.ts`, `team/winrate-series.ts` — were written
to the same no-I/O rule as everything in §1's table and are just as testable. `isFullStack`
is the one that most deserves the repo's first test.

**A `select *` view does not follow its table.** Postgres expands the star at CREATE VIEW
time, so adding a column to `match_participants` means recreating `soloq_participants`,
`flex_participants` and `ranked_participants` in the same migration. Nothing enforces
that; the column simply won't be visible through any of them.

**Eight reads bypass `DataSource` and name `SOLOQ_PARTICIPANTS` by hand.** They are listed
in [02 §3b](02-data-model.md). A ninth added later inherits nothing and will read both
queues.

**A team match can only be attributed to a player who was linked at entry time.** Picks
carry `player_id` when the roster was matched and a typed nickname otherwise, so a game
entered with a substitute's nickname never reaches that person's player page at any scope.
Fixing it means editing the series, which is the same escape hatch the derived opponent
rosters have.

**Team matches are dated to a day, not a moment.** `played_on` is a `date` because nobody
records what time a scrim started. Streaks and recent-form lists over a mixed scope
therefore interleave a day's team games with that day's soloQ arbitrarily.
`computeStreak` sorts its own input, so the result is stable rather than insertion-ordered
— but it is day-accurate and no finer.

**A flex row in the team history links out rather than opening a scoreboard.** The ten
participants are all in `match_participants` and the panel could render every one of them,
but nine of those are strangers, and a full scoreboard is a step toward republishing a lobby
this app deliberately doesn't. The board shows the compositions; League of Graphs has the
rest.

**A partial flex stack is not stored at all** (ADR-048). A flex game one of them played
with randoms is invisible everywhere, which is the intended reading of "flex is a team
queue" — the source caption on `/players/[slug]` now says so rather than leaving it to be
inferred.

**The team is judged as of now, not as of the game.** `players.team_role` has no history,
so a roster change re-labels the past: somebody who left is dropped from every fold that
reads the roster, and their games stay in the record under a team they are no longer on. A
`team_members` table with join and leave dates is the fix, and it was declined again in
ADR-050 for a roster that has never changed.

Migration 028 made this sharper rather than better. Deleting a player is now the *only* way
to free a position, so replacing somebody is an explicit two-step act — which makes the
change visible, and still does not record it.

**`/players` loads every player's full history in every source** to build the grid, because
the cards re-rank when the source switch moves. The front page does the same thing for the
roster board and is now the heaviest read in the app; `/players` is the second, and the
first that would want narrowing — either by folding per player on demand or by capping the
pool the grid is built from.

**A player page with several accounts ships several foldings.** The account filter is client
state over folds computed server-side, one per account plus one for all of them
([07 §17](07-frontend.md)). It is aggregates rather than rows and the roster's account count
is small, so this is bounded — but it is bounded by a fact about this roster, not by
anything in the code. Somebody with a dozen accounts would make it the wrong shape.

**`settings/actions.ts` has been split** into `settings/actions/{roster,accounts,sync}.ts`
over a plain `lib/settings/helpers.ts`. The blocker this entry used to describe was real —
a `"use server"` module can only export async functions, so `revalidateRoster` and
`PLACEHOLDER_EMAIL_DOMAIN` had nowhere to live — and extracting them into a non-action
module was the whole fix.

What it leaves open: nothing in `lib/settings/helpers.ts` authorises anything, and several
of its exports hold the admin client. Every caller runs `requireSession()` first, and
nothing enforces that they do.

## 8. Deliberate non-features

These are choices, not omissions:

- **No Match-V5 timeline.** First-blood *victim*, and gold/CS differentials at 10/15
  minutes, need a second call per match with a much larger payload. At ~1.2s per call that
  roughly doubles sync cost. Explicitly declined in the Riot integration notes.
- **No light theme.** One permanent dark theme; a toggle would be dead weight.
- **No public signup.** Accounts are created by hand, and there is no route that makes
  one, and every route in the app is behind the session gate — `/login` is the only path a
  signed-out visitor reaches.
- **No re-fetching of stored matches during a normal sync.** Match data is immutable once a
  game ends; `refetchMatchDetails` is the explicit manual exception.
- **A summary can stay stale indefinitely.** `/api/summaries` only rewrites one after
  `MIN_NEW_GAMES` new games, so a player who plays three and stops keeps the old text and a
  `stale` flag forever. That is the intended trade (ADR-021) — the alternative is spending a
  metered daily request to rewrite a summary that would read almost identically — and the
  player page says so rather than promising a refresh that isn't coming. Writing a note or
  editing AI context sets `force_regenerate` and bypasses it, which covers the case where
  someone actually wants an update now.
- **The player summary can't cite anything outside its window or its splits.** By design:
  it sees 30 games individually plus precomputed aggregates, and is told not to derive
  totals by counting. A question like "how did they do on Ziggs eight months ago" has no
  answer in the prompt, and the correct output is to say there isn't one.

## 9. Cut, not pending

**Phase 14 — private per-player AI chat.** Dropped. It was the last unbuilt roadmap item,
and the identity groundwork it needed shipped anyway in Phase 11 for note ownership, so
nothing here is blocked or half-finished — there is simply no chat feature coming. The AI
in this app stays one-way and group-visible: scheduled player summaries and a team recap
that everyone reads. `match_notes` is therefore the only owner-scoped table the schema
will need.

## 10. What would break first at 10× scale

In the order it would actually hurt:

1. **The Riot rate limit.** The roster is fixed at five, so this only grows through
   *accounts*: every smurf is another id-page call per queue per run. Fix: a production API
   key, or fan out across multiple invocations with a work-queue table.
2. **JavaScript aggregation.** The front page selects the entire participant table. At 50
   players it's hundreds of thousands of rows into memory on every page view. `/prep/draft` makes
   the same trade on purpose for the reference panel — six unfiltered loads, filtered in the
   browser, because the board changes on every click and a round trip per click would make
   the panel feel broken (see the header of `src/lib/draft/context.ts`). It's a far smaller
   dataset and it breaks later, but it breaks the same way, and `loadDraftComps` already
   takes the filter options that would fix it.
3. **The single-row sync lock.** Fine for one job; wrong the moment work is sharded across
   parallel invocations.
4. **Nothing, where the Gemini quota used to be.** The AI layer is deleted (ADR-051), so
   the app's only metered third-party dependency is Riot.
5. **No admin role.** Every signed-in player can rotate the Riot key, delete a teammate
   and remove another player's login. Five people who trust each other is the only thing
   holding it up.
