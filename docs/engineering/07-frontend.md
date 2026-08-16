# 07 — Frontend

## 1. Route structure

```
src/app/
├── layout.tsx                Root: fonts, <Toaster />. No auth logic.
├── robots.ts                 Disallow everything (see §14)
├── login/page.tsx            Public route. "use client".
├── demo/                     Public, read-only, anonymized. A *sibling* of (app), so
│   │                         none of the private chrome or queries can reach in. §14
│   ├── layout.tsx            DemoNavbar + a permanent, non-dismissible banner
│   ├── page.tsx              /demo                    Roster grid + what the tool is
│   ├── player/[alias]/       /demo/player/x           Mirrors /player/[slug]
│   ├── matches/, champions/, tierlists/, insights/
│   ├── scrims/               Own layout — *not* the private one, which carries the
│   │                         "New scrim" button that is the door to the write path
│   └── draft/                Board + reference panel, minus every save action
└── (app)/                    Route group — parentheses = no URL segment
    ├── layout.tsx            Navbar + key banner. Everything inside is authed.
    ├── page.tsx              /              Dashboard
    ├── loading.tsx           Route-level skeleton
    ├── team/page.tsx         /team          Roster grid
    ├── matches/page.tsx      /matches       History, ?player=slug filter, ?page=N
    ├── champions/page.tsx    /champions     Per-player tierlist, ?player=slug
    ├── insights/page.tsx     /insights      Cross-player analysis
    ├── player/[slug]/page.tsx  /player/x    Detail: LP chart, top champions, roles,
    │                                        matchups, heatmap, recent form
    ├── tierlists/            /tierlists     Hand-made rankings; [slug] is the editor
    ├── scrims/               Section with its own layout + tab strip (see below)
    │   ├── layout.tsx        Heading, tabs, "New scrim" — wraps everything under it
    │   ├── page.tsx          /scrims                  Overview: records, players
    │   ├── team/             /scrims/team             The filtered team view — §15
    │   ├── history/          /scrims/history          Every series, drafts rendered
    │   ├── drafts/           /scrims/drafts           Pick/ban aggregates
    │   ├── opponents/        /scrims/opponents        Teams; [slug] is the scouting page
    │   ├── new/              /scrims/new              The entry form
    │   ├── [id]/             /scrims/x                One series
    │   └── actions.ts        Save / delete series, opponent notes, game-note CRUD
    ├── notes/                No page.tsx, so no route — just the note CRUD server
    │   ├── actions.ts        actions and their form-state type, shared by every
    │   └── form-state.ts     surface that renders a match row.
    ├── draft/                Section with its own layout + tab strip, see docs/features/
    │   │                     draft-strategy/ for the phased build-out
    │   ├── layout.tsx        Heading, tabs — wraps everything under it
    │   ├── page.tsx          /draft                   Board + reference panel (Phases 4-7)
    │   ├── champions/        /draft/champions         Lane roles + function tags (Phase 1)
    │   ├── comps/            /draft/comps             Saved five-champion sides (Phase 3)
    │   ├── synergies/        /draft/synergies         Saved 2-4 champion combos (Phase 3)
    │   └── counters/         /draft/counters          Who answers whom (Phase 2)
    ├── settings/             Roster CRUD, Riot key, AI context, logins
    └── account/page.tsx      Password change
```

The `(app)` route group is what lets one layout wrap every authenticated page without
adding an `/app` prefix to any URL. `/login` sits outside it precisely so it doesn't get
the navbar. `/demo` sits outside it for a stronger version of the same reason: the private
layout reads `sync_state` and the session, and its navbar carries a Sync button, an
account email and a link to `/settings`. Inheriting any of that on a public page would be
either a leak or a 500.

**Every page except `/login` is a Server Component.** No `"use client"`, no `useEffect`
data fetching, no loading state management. Client components exist only where
interactivity genuinely requires them.

### The navbar has eight slots now, and each new section costs one

`NAV_ITEMS` in `components/navbar.tsx` was seven links, tight even before Draft: adding
Scrims meant **Settings moved out** of the array into the right-hand cluster as a gear icon
next to `/account` — which is where it already sat visually. It's an admin page, not a
browsing destination, and it's the one link nobody needs a label to find. Below `sm`, where
the whole right-hand cluster hides, the sheet footer carries Settings alongside account and
sign-out, exactly as it already did for those two.

Draft is the eighth link, and it's the one that actually broke the budget: seven links plus
the matchup search, Sync, the gear, the account link and Sign out were already close to
1024px of content at a 1024px breakpoint. Rather than reorganize the row again, the
collapse itself moved — `lg:flex` → `xl:flex` on the link row, the matchup search and the
sheet trigger. Below `xl`, all eight links live in the sheet; there was no more room to buy
back at `lg` without cutting something.

Both Scrims' and Draft's sub-pages are **tabs under one nav slot**, not four or five more
of them. The tab strip lives in the section's own `layout.tsx` so each tab stays a server
component with its own query; only the strip itself (`components/scrims/scrim-tabs.tsx`,
`components/draft/draft-tabs.tsx`) is a client component, because only it needs
`usePathname`. Draft's shell is `max-w-[96rem]` against scrims' `max-w-6xl` — the simulator
puts five pick slots either side of a champion grid, and §13's reference panel wants a
column beside all of it. Below 96rem that cap is a no-op, so the only screens it changes are
the ones that had the room going spare.

Neither strip scrolls. They were `overflow-x-auto`, which computes the *other* axis from
`visible` to `auto` — and the active tab's underline sits at `-bottom-px`, one pixel of
vertical overflow, which was enough to put a scrollbar on a strip of five short links and to
clip the underline that caused it. They wrap instead.

### Active state is prefix-matched

`active={pathname === item.href}` meant `/scrims/history` lit nothing — and that had always
been true of `/player/[slug]` and `/tierlists/[slug]` too, it just wasn't noticed because
those are leaf pages you arrive at by clicking through. `isActive()` special-cases `/`
(every path starts with it) and prefix-matches the rest.

## 2. The data-fetching pattern

Every page follows the same three-phase shape. From `player/[slug]/page.tsx`:

```ts
// Phase 1 — what's needed to resolve the entity
const [{ data: player }, version] = await Promise.all([
  supabase.from("players").select("*").eq("slug", slug).single(),
  getLatestVersion(),
]);
if (!player) notFound();

// Phase 2 — everything that depends only on the id, concurrently
const [matchList, aiSummary, ownRows, rankHistory, championMap] = await Promise.all([…]);

// Phase 3 — what needs ids discovered in phase 2
const { data: allParticipants } = await supabase
  .from("match_participants").select(…).in("match_id", matchIds);
```

The `Promise.all` grouping is not cosmetic. Serial `await`s here would be five sequential
network round trips to Supabase on every render. One commit in the history
(`bce24f7 Parallelize page-level Supabase queries`) exists purely for this.

**The empty-array guard is load-bearing:**

```ts
matchIds.length > 0
  ? await supabase.from("match_participants").select(…).in("match_id", matchIds)
  : { data: [] as ParticipantRow[] }
```

PostgREST's `.in()` with an empty list is a query you don't want to send at all.

### Why participants are fetched twice

An `!inner` join with a filter on the embedded table returns **only the matching embedded
rows** — so `match_participants!inner(player_id)` filtered to one player gives you that
player's row, not all ten. Full team compositions need their own unfiltered
`.in("match_id", …)` query. That's why the pages look like they're double-fetching; they
aren't.

## 3. The PostgREST ordering trap

This one caused a real, silent bug in three places and is the single most valuable
Supabase lesson in the codebase.

```ts
// ✗ Silently returns rows in insertion order
supabase.from("match_participants")
  .select("…, matches!inner(game_creation)")
  .order("game_creation", { foreignTable: "matches", ascending: false })
  .limit(50)

// ✓ Order by a true top-level column
supabase.from("matches")
  .select("id, game_creation, …, match_participants!inner(player_id)")
  .eq("match_participants.player_id", id)
  .order("game_creation", { ascending: false })
  .limit(50)
```

**PostgREST's `foreignTable` order only reorders embedded to-many collections *within*
each parent row. It cannot reorder the parent rows by a column in a to-one join.** The
`.order()` doesn't error — it no-ops, and rows come back in insertion order.

Combined with `.limit(50)`, that means you get *an arbitrary 50 rows*, not the 50 most
recent. In the match history it looked like a sorting glitch (commit `8aa432c`). In the AI
prompt it silently fed stale games into every summary for weeks.

**The fix is always the same: query from the table that owns the sort column**, embed the
other side, and flatten the nested object in JS:

```ts
const rows = (data ?? []).map((r) => ({
  ...r,
  game_duration_seconds: r.matches?.game_duration_seconds ?? 0,
  game_creation: r.matches?.game_creation ?? "",
}));
```

That flatten step is why the stats libs take flat `XInput` types rather than the nested
shape Supabase returns.

## 4. Pagination on `/matches`

`/matches` pages through history with a `?page=` search param and `.range()`, rather than a
cursor or a client-side "load more".

```ts
const from = (page - 1) * MATCHES_PER_PAGE;
supabase.from("matches")
  .select("…, match_participants!inner(player_id)", { count: "exact" })
  .order("game_creation", { ascending: false })
  .range(from, from + MATCHES_PER_PAGE - 1);
```

Four things worth knowing:

**Page-number, not cursor.** A cursor on `game_creation` would be immune to offset drift,
but it can't produce "page 2 of 7" or a total count without a second query. The drift
window here is only a sync — daily, or when someone presses the button — so a match can at
worst repeat across a page boundary. That's the right trade for a page whose data changes
once a day, and the reasoning is recorded in the code.

**`count: "exact"` counts parent rows.** With `match_participants!inner`, PostgREST embeds
the children as an array rather than multiplying the parent the way a SQL join would — so
the count is the number of matching *matches*, which is what the pagination needs.

**The page unit is a match, not a rendered row.** With no player filter, one game that
several tracked players were in renders a row each, so a 50-match page can show more than
50 rows. Paginating by the query unit is what keeps the offset arithmetic honest.

**Out-of-range pages 404.** Page 1 always renders — an empty roster is a valid empty state
— but `page > 1` with no results calls `notFound()`, consistent with how `/champions`
treats an unknown `?player=`.

The nav is a plain Server Component of `<Link>`s (`matches-pagination.tsx`), so the page
keeps its no-client-fetching property, and a given page stays shareable and bookmarkable.
Disabled edges render as `<span>`, not as an `<a>` without an `href` — the latter is still
focusable in some browsers and reads as actionable to a screen reader.

## 5. Server Actions

All writes. The convention:

```ts
"use server";
export async function addPlayer(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    const { supabase } = await requireSession();
    // …validate, act…
    revalidatePath("/settings");
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
```

Four consistent properties:

- **Errors are returned, not thrown.** `PlayerFormState` / `NoteFormState` are discriminated
  results consumed by `useActionState`, so the form renders the message inline instead of
  hitting an error boundary.
- **`requireSession()` first, always.** Server Actions are POST endpoints reachable
  independently of the proxy.
- **Postgres error codes are translated.** `23505` (unique violation) becomes "This
  player's Riot ID or display name is already tracked."
- **`revalidatePath` is explicit per affected route**, including the dynamic form:
  `revalidatePath("/player/[slug]", "page")`.

Cleanup on failure is handled properly in both directions: a failed player insert deletes
the avatar it just uploaded; a failed player-link deletes the auth user it just created.

## 6. Client components, and where the boundary sits

| Component | Why it must be client |
|---|---|
| `login/page.tsx` | `signInWithPassword` + RPC from the browser |
| `navbar.tsx` | Sync `fetch`, sign-out, `usePathname`, sheet state |
| `charts/*` | Recharts needs the DOM |
| `award-tile`, `stat-ranking` | Dialog open/close state |
| `notes-section`, all `settings/*` forms | `useActionState` |
| `matchup-search`, `matches-filter`, `champions-filter` | Local input state |

**Client components receive fully-prepared, serializable props.** No component fetches its
own data. `MatchRow` gets a plain object with `allies`, `enemies`, and `opponent` already
resolved by the server; the champion map arrives as a `Map` prop from the parent.

## 7. Loading states

Every route with meaningful data has a `loading.tsx` — dashboard, matches, champions,
insights, player, settings. They're **structural skeletons** that mirror the
real layout (`RosterRowSkeleton`, `MatchRowSkeleton`) rather than a spinner, so the page
doesn't reflow when data arrives.

The one action with a genuinely visible duration — Sync — has its own inline state in the
navbar, with three distinct outcomes:

```ts
if (data.partial) toast.warning(`${result} Hit the rate limit — sync again to continue.`);
else              toast.success(result);
```

A partial run reporting plain success would make a backfill look stuck. This is the UI
end of the sync engine's partial-run design.

## 8. Design system

`src/app/globals.css` is the entire design system — one file, no `tailwind.config.js`
(Tailwind v4 configures through CSS).

**One permanent dark theme.** shadcn's tokens are mapped directly onto the app's palette
in `:root` rather than keeping shadcn's light-mode defaults plus a `.dark` block. There's
no toggle, so the second theme would be dead weight.

The current look is "hextech" — near-black backgrounds, LoL-gold as the primary accent,
hextech cyan as secondary, warm cream text (`#f0e6d2`, not pure white), sharp corners.

Three things worth noting about how it's built:

**`--radius` drives everything through a calc chain.**

```css
--radius: 0.25rem;                       /* was 16px */
--radius-sm: calc(var(--radius) * 0.6);
--radius-lg: var(--radius);
--radius-2xl: calc(var(--radius) * 1.8);
```

Every `rounded-*` utility in the app resolves through this, so re-sharpening the entire UI
from rounded cards to angular ones was a one-line change.

**Contrast was verified, not eyeballed.** All accent and status colors are documented as
re-checked at ≥4.5:1 against `--color-bg-secondary` (WCAG AA). That pass caught
`--color-loss` sitting at ~3.1:1 in the earlier grey-based palette.

**Semantic colors that break the palette do so deliberately.** The original spec mandated a
strict blue/navy/grey scheme; the app uses standard green/red for win/loss, tier colors for
rank badges (`rank.ts:TIER_COLORS`), amber for key expiry, and a *separate* red
(`--color-danger`) for destructive UI actions so it can't be confused with `--color-loss`.
The justification is consistent across all four: these are colors whose meaning is
pre-loaded in the user's head, and overriding that to satisfy a palette costs more than it
gains.

Fonts: Geist for body, Geist Mono, and **Rajdhani for headings and big stat numbers only**
(`--font-heading`). `tabular-nums` is applied to essentially every number in the app so
stat columns align.

## 9. Charts

`src/components/charts/`. Recharts for the LP chart and tilt curve; **plain CSS grid for
the heatmap and duo matrix** — a grid of colored squares doesn't need a charting library.

`chart-theme.ts` holds the shared visuals, with two decisions worth calling out:

**Literal hexes, not `var(--color-*)`.** Recharts writes colors into SVG *presentation
attributes*, where custom-property support is inconsistent enough not to bet a chart on.
The file mirrors `globals.css` and says so.

**The categorical palette is validated, not picked by eye.**

```ts
// Validated against the #10151d chart surface for the OKLCH lightness band,
// chroma floor, protan/deutan separation, normal-vision separation, and contrast
export const SERIES_COLORS = ["#af7c00", "#5e6bd4", "#4ea954", "#9e4aa4", "#00a5b5", "#b33736"];
export const MAX_SERIES = SERIES_COLORS.length;
```

`MAX_SERIES` is enforced rather than cycled: `/insights` charts the top 6 players by rank
and shows a caption saying so, because a seventh line reusing a color makes two players
indistinguishable. Cycling a palette is the standard behaviour and it's a bug.

### The LP chart

The most involved component in the app (`lp-chart.tsx`, ~400 lines):

- **A real time axis** (`t` = epoch ms), so an idle week reads as a gap, not a step.
- **`mergeSeries`** builds one row per distinct timestamp across all players, so a single
  `LineChart` can draw players whose sync times don't line up. Missing values stay
  `undefined` and are bridged with `connectNulls` rather than plotted as zero.
- **`ladderDomain`** rounds out to whole divisions so the axis never ends mid-division, and
  keeps a visible band when LP has barely moved.
- Tooltips use `formatLadderPointsDetailed` (with LP); ticks use `formatLadderPoints`
  (without) — see [05 §2](05-stats-and-domain-logic.md) for why those are two functions.
- Optional avatar end-caps on `/insights`, so a six-line race is readable without
  cross-referencing a legend.

## 10. The drill-down pattern

`StatRankingDialog` is the strongest UI idea in the app, and it generalizes:

> Every headline number in the app is the top of an ordered list that was thrown away on
> the way to rendering it. This dialog is that list.

Award tiles, heatmap cells, and tilt-curve points are all clickable, and all open the same
dialog with the full standings — every contender in order, with the value and the sample
size behind it. Each carries a `metric` line stating plainly what's being measured, and
the leader is tinted in the same tone as the tile that opened it, so "worst KDA" opens on
a red number at rank 1 and reads as the same statement rather than a mistake.

The general principle: **an aggregate that can't be decomposed invites distrust.** A
roster-wide heatmap cell is exactly the shape of number someone looks at and thinks "that
isn't me" — so let them check.

## 11. The scrim draft board

`components/scrims/draft-board.tsx` is the densest component in the app — twenty
champions, ten stat lines and a result, per game — so its layout is load-bearing rather
than decorative.

### Role-paired rows, not two team lists

The first version rendered each team as its own list: role label, champion icon, player
name on a `flex-1` spacer, then K/D/A and CS pushed to the far edge. That reads wrong in
two ways. The champion ends up visually glued to the *role label*, which tells you nothing,
while its own K/D/A and CS — the numbers that describe that exact pick — sit an inch away
across a stretched gap. And the same five role labels appear twice.

It's now five rows, one per role, ally on the left and enemy on the right with the role as
the axis between them:

```
[icon] Dr. Mundo             TOP             Trundle [icon]
       Joshy · 2/4/7 · 197 cs      10/2/5 · 240 cs
```

Champion name and its stats are one block. The lane matchup — the pair you actually review
a scrim for — reads straight down the middle. Role labels halve.

Two width rules make it work, and both were wrong at first:

- **The board is capped and centred** (`max-w-3xl` inside the card). At `1fr` per side on a
  `max-w-6xl` page the two teams get pinned to opposite edges with a canyon between them,
  which is the opposite of a face-off.
- **The cap lives on `ScrimGameCard`, not on the board**, so the header (`Game 1 · WIN ·
  BLUE SIDE … 30:34`) shares the board's measure instead of spanning past it.

Row heights stay equal by truncating rather than wrapping. Truncation would eat the CS
number first, so **CS/min is `hidden sm:inline`** — it's derived from the CS already shown,
making it the one thing on the line you can drop for free.

### Bans read as bans

`ChampionIcon` takes `banned`, which greys *and* strikes the portrait through a clipped
diagonal. Dimming alone reads as "disabled" or "still loading", and at 24px there's no room
for a label. Empty ban slots render as dashed outlines rather than collapsing, so a series
where somebody only entered three bans looks incomplete instead of looking like a
three-ban format.

### The note thread under the draft

Every game card carries a thread (`components/scrims/scrim-game-notes.tsx`), on both
`/scrims/history` and `/scrims/[id]`. Anyone can answer any note, **including a reply** — but
the drawing stops at two levels however deep the conversation actually goes. Answers sit under
the root behind a single left rule, in time order, and one whose target *isn't* the root prints
`replying to <name>` above itself instead of earning another indent. Indenting per level inside
a card that already carries twenty champion portraits is unreadable by the third reply on a
phone; the name costs one line and never runs out of width.

**Only the first reply stays visible**, with `Show N more replies` under it — same reason — and
the oldest reply is where the exchange starts, so it's the one worth leaving up.

Roots read newest-first and replies oldest-first, which looks inconsistent and isn't: the list
of notes is a feed, and a conversation read backwards is nonsense.

The composer stays pinned at the bottom of the thread rather than moving under whichever note
was clicked, because replies append chronologically and that's where the next one will appear.
`replying to <name>` above it is what keeps the target unambiguous, and it's keyed on the
target id so switching who you're answering doesn't carry a half-typed reply across.

Three more decisions in it:

- **The composer is collapsed behind an "Add a note" button.** The history page renders
  every game ever played; an always-open textarea per card would be a column of empty boxes
  taller than the drafts they belong to. `NotesSection` on soloq matches keeps its textarea
  open because it lives inside a row you had to expand first.
- **Authors are resolved server-side** (`labelAuthors`), so the client component gets a plain
  array and the user-id→name Map never enters the RSC payload — it would otherwise be
  serialised once per card.
- **`useTransition` + `toast`, not `useActionState`.** Matches `OpponentNotesForm` and
  `DeleteSeriesButton`: the scrim actions take typed arguments, not `FormData`, so there's no
  form state to thread. §7's table is the general rule; this is the same rule applied.

Cards take `notes` as an optional prop. `undefined` means "this surface doesn't load notes";
an empty array means "none yet", which still gets the composer.

### `BarRow`

Ranked champion lists (`/scrims/drafts`, the scouting page) draw each row's value as a
tinted fill *behind* the row. The shape of the distribution — "these three, then a long
tail" — lands before any number does, and a background fill costs no horizontal space,
which matters inside a two-column grid. Pick and ban lists scale against the top row of
their own list; presence scales against 100%, because it's a rate with a real ceiling.

## 12. The draft simulator board

`/draft`, built in Phase 4 of `docs/features/draft-strategy/`. Ten ban slots, ten pick
slots, a champion grid in the middle. Where §11's scrim board *renders* a draft that
happened, this one is a scratchpad for one that hasn't.

### There is no turn machine, and that is the design

A real draft is fifteen alternating actions across two ban phases. Encoding that would mean
the board refuses clicks while someone is trying to sketch "what if they take this at R1",
which is the entire reason to open it. Any slot is fillable at any time, in any order.

The 3 + 2 gap in each ban row is the only nod to real draft structure and it is purely how
the row is drawn — there is no phase-one/phase-two logic behind it, no ordering rule and no
gating. There is a comment saying so where the gap is applied, because it looks like state.

### Interactions

Left click selects a slot; the next champion clicked in the grid lands there and the active
slot **advances to the next empty slot on the same side and kind, wrapping**. Filling blue's
picks is one slot click and five grid clicks rather than ten alternating ones. Wrapping
matters because slots fill in any order: having done B3 and B4 first, advancing from B5
should find B1 rather than give up.

Right click empties one slot, and `preventDefault()` on `onContextMenu` is the whole trick —
without it the browser menu opens *and* the slot clears, which is worse than either alone.
Right-click is not an accessible affordance and clearing is the only destructive action
here, so every filled slot also carries a small `×` on hover or keyboard focus.

Unavailable champions are greyed in the grid, never filtered out — the same call
`ChampionCombobox` documents, for the same reason: seeing that Ahri is taken is
information, and an entry that vanishes reads as a bug.

### Empty slots use a champion icon that isn't from DDragon

`EMPTY_CHAMPION_ICON_URL` in `lib/ddragon.ts` is the grey "no champion" portrait, and it
comes from CommunityDragon — the only host besides DDragon this app fetches images from.
DDragon has no such asset (`img/champion/-1.png`, `None.png` and `0.png` all 403). It was
worth the extra host because it serves `Access-Control-Allow-Origin: *`, so it survives
`crossOrigin="anonymous"` and doesn't taint the canvas during the PNG export — which would
have ruled it out — and because a board of grey silhouettes exports as something that looks
like a draft, where dashed boxes export as something that looks like a form. The failure
mode is a missing decoration: the slot still draws its border and label.

### Fearless: picks carry, bans don't

The board is a five-game series, one game on screen at a time. For the visible game, a
champion is unavailable if it is **banned in this game** (either side), **picked in this
game** (either side), or **picked in any *earlier* game** (either side). Bans do not carry
between games; picks do.

That asymmetry is the whole format, and it's the one thing on this board a person cannot
verify by looking — which is why `unavailableInSeries` and `carriedPicks` live in
`lib/draft/board.ts` as pure functions rather than inline in the component. Get the carry
direction backwards and the board confidently tells you a champion is free when it isn't.
`usedEarlierInSeries` in `scrims/draft-form-state.ts` is the same rule for the scrim entry
form; if an organiser ever counts bans too, those are the two functions that change.

**"Earlier" is `j < gameIndex`, not `j !== gameIndex`.** The second is easier to write, is
wrong, and only shows up when someone goes back to fix game 1 after filling game 3. The
series is played forwards but edited in any order, so the carried set is recomputed per
switch rather than fixed per game. This is where the scrim form differs: it renders every
game's fields at once, so its set is fixed per field.

The switcher is five plain buttons. They carried a filled-slot count for a while, on the
theory that an untouched G4 should be visible from G1 — in use it was noise, and switching
to a game is one click.

**Greyed means two different things, and the grid says which.** A champion greyed because
someone just banned it this game is a different situation from one your mid laner played in
game 1. Both are equally unclickable and look the same; the carried one carries a `G1` /
`G2` badge. Only that case gets a badge — "taken" is legible from the board itself, since
the champion is sitting in a slot two inches away, while "played in game 1" is invisible
unless the tile says so. Hence `Map<number, UnavailableReason>` rather than a `Set`.

**The rule looks backwards, so editing an earlier game needs a forward check too.** Nothing
in `unavailableInSeries` stops someone opening G1 and placing a champion G3 already picked
— G1 only consults the games before it. The result would be the same champion in two games
of a format whose entire premise is that it can't, with *neither* grid flagging it, because
each is only checking backwards. `conflictsAfter` is that forward check, and placing into
the conflict raises `PickConflictDialog` rather than being silently refused: refusing would
mean clearing every later game by hand before fixing a typo in G1.

Confirming calls `releaseChampionAfter`, which strips that one champion from later games and
leaves those drafts otherwise intact. Clearing whole games would also resolve it and has an
argument behind it — a fearless game drafted against a pool that has since changed is
arguably stale — but most edits to an earlier game are fixing a typo, and losing three
drafted games to a typo is the worse failure. Bans are stripped too, not just picks: a
champion picked earlier is unavailable for *every* slot later, ban slots included.

A **Fearless toggle** sits next to the switcher, defaulted on. Not every series is fearless
— `scrim_series.fearless` exists as a column for that reason — and off makes each game
independent. It's threaded as an argument to `unavailableInSeries`, not a module flag.

`MAX_GAMES = 5`, against the ten `lib/scrims/types.ts` allows. That limit exists because
the `scrim_games_number` check constraint does and hand-entry shouldn't fight the database;
nothing is written from here, and five buttons fit in a row where ten are noise.

### State lives in the tab, not the database

One `useState<GameBoard>` and one `useState<SlotRef | null>`. No reducer, no context, no
store (ADR-019). A saved board would be a fourth table, a CRUD surface, a list page and an
ownership question, in exchange for state that is genuinely disposable — what's worth
keeping off a board is a comp, a synergy or an image, and Phases 3 and 6 cover all three.

`sessionStorage` covers the only real complaint, which is losing work to a misclick on the
tab strip. The key is `draft-series-v1` and holds `{ series, currentGame, fearless }`. It
was **bumped rather than migrated** from the single-board `draft-board-v1`: that payload has
`bans`/`picks` at the top level and would read as `series[0]` being `undefined`, so the
shape check rejects it and the tab starts empty — the right outcome for a session left open
across a deploy. **Rehydration happens during render, not in an effect.** Three options and only
one works: `useState`'s initialiser runs on the server, where `sessionStorage` doesn't
exist, and a board that differs between server and first client render is a hydration
mismatch; an effect is a second render pass after paint and trips
`react-hooks/set-state-in-effect`. Adjusting state during render is the sanctioned third —
the same pattern `champion-profile-table.tsx` uses to resync from a changed prop. A
`useHydrated()` built on `useSyncExternalStore` (`() => true` client, `() => false` server)
is what makes "after hydration" a value the render can branch on. The stored JSON is
untrusted input and goes through `isGameBoard` first; a key left by an earlier version of
the board would otherwise crash the render rather than fail cleanly.

### Saving off the board

Two buttons write `draft_comps` rows through **Phase 3's `saveDraftComp`, unchanged** — that
action takes its kind in the payload and assumes nothing about where the champions came
from precisely so this could exist without a second write path into the same table. Two save
paths into one table is the duplication the one-table decision was made to avoid.

**Save composition** takes one side's five picks. With both sides full the dialog asks
which; with one, it's preselected and the chooser doesn't render. The dialog previews the
champions it will write — non-negotiable, because it covers the board while open, so "did I
save blue or red" is otherwise unanswerable until you visit `/draft/comps`.

That preview is also the control: `CompOrderEditor` makes it a `@dnd-kit` sortable row.
Champions arrive in draft order, which is rarely how anyone reads a comp, so dragging them
into TOP→SUP is what makes the saved row legible later — and for a five-champion comp each
position is labelled with the role it implies, both here and on `CompCard` afterwards. The
label goes gold when `champion_profiles` says that champion plays there, which is a hint
while sorting rather than a claim about the row: a champion can be annotated for several
roles, so nothing derives one role per slot. Position does that. See §12 of
[02](02-data-model.md).

**Save synergy** is a mode over the board rather than a dialog-first flow. Filled pick slots
become selectable; empty slots, bans and the whole champion grid go inert. A mode that both
selects and edits produces accidental picks, and picking a champion mid-selection would
change the very slots being selected. **Selection is confined to one side** — the first pick
locks the other side for the rest of the mode. A synergy spanning both teams isn't a
synergy, and the contextual panel would later match it against your own picks and suggest a
combo containing an enemy champion. Escape leaves the mode, but the listener detaches while
the save dialog is open, or one keypress unwinds both and throws away the selection behind
it — the nested-dismissal problem `ChampionCombobox` solves with `stopPropagation`.

**Nothing about the board changes on save.** No clear, no navigate, no deselect. Someone who
just saved blue is usually about to save red and keep drafting; saving is a read of the
board, not a state transition on it. The toast carries a "View" action instead, the same
call `OpponentNotesForm` makes by saving in place.

Note that the save dialog follows `DRAFT_COMP_SHAPE`, so a synergy gets no win-condition
field and neither kind requires a name — see §12 of [02](02-data-model.md).

### Performance, once, so it doesn't come up again

There are ~170 champions and availability is one `Set.has` per tile, built once per render
in a `useMemo` keyed on the board. A full re-render is ~170 hash lookups over DOM nodes that
already exist and only change a class. There is no virtualisation, no per-tile `React.memo`,
no debounce on the search and no index beyond that one `Set`. Every plausible culprit in
this component is cheaper than the profiler you would need to find it.

---

## 13. The draft reference panel

`components/draft/context-panel.tsx`, built in Phase 7. A rail down the right of the board
that opens under the cursor and pushes the board left, with two modes over the same four
tables: **Contextual** filters champions, counters, comps and synergies against whatever is
on the visible game; **Explore** shows them unfiltered with a search box each, for looking
something up mid-draft.

**Hover opens it; the pin keeps it.** `open` is therefore a pin, not a visibility flag —
`expanded = open || hovered`. Either alone is wrong: hover-only closes the panel the instant
you reach for a champion, which is precisely when you were reading it, and click-only makes
a glance cost two clicks and leaves the board permanently narrower for someone who wanted to
check one thing. Below `xl` there's no room to push anything, so `open` means what it says
and hover plays no part.

**The collapsed rail advertises what's inside it** — the portraits of champions that would
complete a saved synergy, how many noted answers against their picks are still takeable, how
many saved comps share a pick, each under the section name you'll see when it opens. These
are counts, not suggestions; see the next heading for why that distinction is load-bearing.
It costs nothing: the rail and the sections are never mounted at the same time, so those
scans replace the sections' rather than adding to them.

### There is no engine

No scoring, no ranking, no suggestions, no notion of a good draft. A scoring function would
need weights nobody here could justify, would be confidently wrong against a specific
opponent, and would turn the panel's output into something to argue with rather than
something to read. Filtered reads have exactly one failure mode — a row that should have
matched didn't — and that one is debuggable. If a future version wants suggestions, that is
a new feature with a new name.

It is also **read-only**. Every row links to its home page and that is the whole affordance.
Editing from here would mean a second write surface into every one of those tables, each
with its own validation and its own optimistic update against a board that is *also*
changing, for a surface you glance at rather than work in.

### It loads all four tables, unfiltered

`/draft/page.tsx` runs five loads and passes `loadDraftComps` no options at all, which looks
like an oversight. It isn't, and the reasoning is at the top of `lib/draft/context.ts` for
the next person who sees it. The board changes on every click; a server round trip per click
would make the panel feel broken. The whole dataset is ~170 profiles, a few dozen tags, some
hundreds of counters and maybe a hundred comps — less than one page of `/insights` already
pulls, and the same trade ADR-015 and ADR-024 document for every stats page in the app. The
options on `loadDraftComps` exist for the list pages, which fetch one kind for one route.

### The filters, and the two that are easy to get wrong

All of them live in `lib/draft/context.ts`, pure on the same terms as `board.ts`.

**`nearSynergies` filters against the series-aware unavailable set**, not this game's board.
A saved combo where all but one champion is already picked is the single most actionable
thing the panel can show — and suggesting a champion your jungler played in game 1 is
exactly the mistake the fearless rule exists to prevent. That failure would be a confident,
specific, wrong suggestion rather than an obviously empty section, which is why the filter is
in the function rather than left to the caller.

**Both counter lists read `counteredBy`**, which looks like one of them is a copy-paste slip.
A row says `counter_champion_id` beats `target_champion_id`, so "what answers this champion"
is always a lookup on the target side; only whose picks you look up differs. *Answers* is
`target ∈ their picks`, *Watch out* is `target ∈ our picks`. Getting it backwards shows the
enemy's answers as yours, silently and plausibly. The same trap applies to the our-side
toggle: it has to reach all four sections, so it travels as one object rather than four
props.

**Which end of a matchup leads depends on the question.** Contextual reads "Ornn vs Jarvan" —
the target is already on the board two inches away, so the answer is the new information.
Explore reads "Jarvan ← Ornn", because nothing is on the board there, the search is by the
champion you want beaten, and leading with the answer makes the list read backwards. Same
rows, same table, opposite question; `CounterRow` takes a `lead` prop and the strike-through
follows the *counter* whichever end it's drawn at.

**Contextual sorts takeable answers first**, and the section's count is how many of those
there are rather than how many rows exist — a header reading "9" over nine struck-through
names is worse than no number. Sorted, not filtered: "we had an answer to this and it's gone"
is real information about the draft you're in, and a row that silently vanishes reads as a bug
in the notes.

**A comp matches on one shared pick, not two.** Two was the phase doc's number and it kept the
section empty through exactly the part of a draft where it was worth reading — first pick is
when "we have a saved comp built around this" is useful, and by the time two are down the
direction is usually chosen. Overlap sorting does the noise control instead.

### Docked or overlaid, decided in JS

At ≥1280px the panel is a column in the board's flex row; below that it is `ui/sheet.tsx`
with `side="right"`. **The phase doc called for a CSS breakpoint and it can't be one**:
rendering both mount points and hiding one with `xl:hidden` leaves a base-ui Dialog mounted
and open at desktop widths, still trapping focus and locking scroll behind a popup nobody can
see. So `useDocked()` is a `useSyncExternalStore` over `matchMedia`, whose server snapshot is
`false` — the first render is always the Sheet branch, and nothing flips visibly because the
panel starts closed and a closed Sheet renders nothing.

The sheet sets `initialFocus` to itself for the same reason the navbar's menu does: Explore
opens with a search box at the top, and autofocusing it pops the keyboard the moment the
panel appears.

**Docked, it's out of flow, so it can reach the window edge.** The page lives in a centred
`max-w-[96rem]` shell and the panel doesn't: it's `absolute inset-y-0 right-[calc(50%-50vw)]`
against the simulator row, where the negative gutter walks it out to the glass. What pushes
the board is a separate in-flow spacer sized to the **overlap** rather than to the panel —
`max(0px, 30rem - 50vw + 50%)` — so the panel only costs the board whatever it can't fit in
the gutter beside the shell. On a wide screen a collapsed rail is free and the board keeps its
full width; open, it takes the couple of hundred pixels it can't find.

That is also why `body` carries `overflow-x: clip`: `50vw` counts the classic scrollbar and
half the shell's width doesn't, so the bleed can land a few pixels past the glass. `clip`
rather than `hidden`, which would make body a scroll container and break every sticky in the
app.

**Its height needs no number at all.** `inset-y-0` — the row is `items-start` and the board is
the only thing in it with any height, so the row *is* the board's height and stretching to it
lines the two flanks up exactly at every viewport. This used to restate the champion grid's
clamp plus a guess at the ban panel, which was both short and a second copy of a number living
in `draft-champion-grid.tsx`. Being out of flow is what makes it safe: the panel can't feed
its own height back into the row it's measuring.

**The sections lay out in a grid, driven by container queries rather than breakpoints.**
Contextual puts synergies and counters on the top row — the two reads you make at the same
moment — with compositions and champion tags spanning below. Explore is a plain 2×2. The
switch is `@md` (28rem) on the scroller, not a viewport breakpoint, because the same sections
render at 30rem docked and at a phone's width in the sheet and the viewport can't tell those
apart. That three-number coupling is unenforced — see §6 of [10](10-known-gaps.md).

The panel sits *outside* `BOARD_ELEMENT_ID` rather than opting out with `data-export-hide` —
docked, it's a column beside the board, not chrome on top of it, and there is no sense in
which it belongs in a picture of the draft. It carries the attribute anyway, so the export
keeps working if the layout moves.

### Mode defaults to Explore on an empty board

Contextual with nothing placed is four empty sections and no way to tell that's expected. So
the mode is derived: `modeChoice ?? (boardEmpty ? "explore" : "contextual")`, where
`modeChoice` is null until the user presses one of the two buttons and stays filled after.
Derived rather than synced in an effect, so there is no render where the mode is stale. If
someone does choose Contextual on an empty board they get one message and a button back to
Explore, not four empty states.

Every empty state names what is missing and links to the page that fills it. "Nothing yet"
four times tells nobody anything; *"No saved synergy matches these picks"* and *"No answers
noted against Renekton, Nasus"* point at different tables.

### Not a `dense` CompCard

The phase doc suggested adding a `dense` prop to `CompCard` rather than a second card. The
panel's `CompRow` is a separate component instead: `CompCard` is a card with edit and delete
controls, a notes toggle and a name-leads-or-champions-lead rule, while the panel row is a
read-only line that has to grey the champions you don't have and ring the one you'd need.
Sharing them would mean `dense` plus an optional `onEdit` plus a per-champion emphasis
callback on a component whose job is none of that. They share `ChampionAvatar` and `Badge`,
which is the part that would actually drift.

## 14. `/demo` — one page, rendered twice

The public demo is the same pages against anonymized data. The security half is
[04, §10](04-auth-and-security.md); this is how it avoids being a second copy of the
frontend.

### `DataSource`, not `if (demo)`

A loader takes a `DataSource` instead of a `SupabaseClient`:

```ts
export type DataSource = {
  supabase: SupabaseClient;
  table: (name: TableName) => string;   // "matches" → "matches" | "demo_matches"
  demo: boolean;
};
```

The `demo_*` views expose **the same column names** as the base tables, so the only thing
that differs between the two reads is the table name. `privateSource(supabase)` and
`demoSource(createPublicClient())` are the two constructors, and the second is the only
place `/demo` gets a client from.

The `demo` flag is not for choosing a table — `table()` does that. It is for the handful
of things the demo has no counterpart *for*: match notes, AI attribution, "Edited by X".
Those are conditional selects rather than conditional renders, so the column is never
fetched:

```ts
const seriesColumns = (source: DataSource) =>
  source.demo ? SERIES_BASE_COLUMNS : `${SERIES_BASE_COLUMNS}, created_by`;
```

Asking a view for a column it doesn't have is a `42703` error, not a `null` — so getting
this wrong breaks the page loudly, which is the correct direction.

### `fetchXRows` + `buildX`, and why the split is mandatory

Every loader in `src/lib/loaders/` is split in two: a `fetchXRows(source)` that returns
**plain arrays**, and a pure `buildX(rows)` that folds them into whatever the page wants.
That mirrors the fetch/compute split the rest of the codebase already uses, but here it is
load-bearing rather than stylistic:

> **`unstable_cache` serializes its entries.** A `Map` returned from a cached loader comes
> back as a plain `{}` on the second request, and every `.get()` on it throws.

The trap is that the *first* request is a cache miss and works perfectly. It looks fine
locally and breaks for the second visitor. Cache the rows; fold afterwards.

### Data cache, not ISR

```ts
export const dynamic = "force-dynamic";          // on every demo page
cachedDemoLoad("insights", () => fetchInsightsRows(source));   // 1h, tag "demo"
```

`export const revalidate = 3600` would be the obvious way to do this and is wrong here:
with no dynamic API in the tree, Next prerenders such a page **at build time**, which
means `next build` connects to Supabase. CI builds with a placeholder project URL
precisely because nothing should be contacted at build time, so an ISR demo page turns a
green pipeline red for reasons unrelated to the code. Keeping the page dynamic and caching
the *data* gets the thing that actually matters — a link passed around a coaching staff
costs one read an hour, not one per person — with no build-time database dependency.

Not `"use cache"` either: that directive needs `cacheComponents: true`, which changes the
rendering model for every existing route. Not a change to make in passing for the demo's
benefit. See [09, ADR-036](09-decision-log.md).

Publishing a demo summary calls `revalidateTag("demo", "max")`. Next 16 takes **two**
arguments there; the single-argument form is deprecated. `"max"` is
stale-while-revalidate, so the first read after publishing still serves the old page — the
success message in `/settings` says so rather than letting it look broken.

### Private-only UI is a slot, not a flag

Where a page has controls the demo must not render, the shared component takes a
`ReactNode` slot or a render prop, and the demo **omits it by not passing it**:

```tsx
<ScrimSeriesView series={series} actions={<SeriesActions … />} notesFor={…} />   // private
<ScrimSeriesView series={series} />                                             // demo
```

A boolean prop (`canEdit={false}`) puts the unsafe branch inside the shared component,
where it renders unless someone remembers to pass the flag. A slot inverts that: the
dangerous markup only exists at the private call site. `ScrimEmptyState` follows the same
rule from the other end — `canAdd` defaults to `false`, so the value that reveals a write
path has to be typed on purpose.

`/demo/scrims` gets its own `layout.tsx` rather than reusing the private one for exactly
this reason: that layout's "New scrim" button is the entrance to the whole write path.

### Tier labels are relabelled, not hidden

`/tierlists` rows are named by the person who made the list, and those names are group
in-jokes. `relabelForDemo` replaces them positionally with `S/A/B/C/D/F`, which is what a
stranger would expect a tier list to say anyway.

The flag that drives it is carried **on the fetched rows**, not passed to the component by
the page. Forgetting a prop would publish the real labels; there is no way to forget a
field that arrived with the data.

### What the demo drops, measured rather than assumed

Anonymization is not free and it is worth knowing what it costs before showing the page:

| Surface | Lost |
|---|---|
| `/demo/draft/champions` | nothing — 96 profiles, 0 notes |
| `/demo/draft/counters` | 4 notes |
| `/demo/draft/comps`, `/synergies` | 1 label, 5 notes |
| every match row | the whole notes panel |
| `/demo/tierlists` | "Edited by X" and the real row names |

The draft simulator survives intact because it is `sessionStorage` state, not a database
read (ADR-033) — a signed-out visitor can pick and ban on the board exactly as a member
can, which is the most convincing thing on the demo and cost nothing to expose.

## 15. `/scrims/team` — the filter is the page

The other four scrim tabs each answer one question over every game ever recorded. This one
answers any of them over a subset, because that is what preparation looks like: not "how do
we draft" but "how did we draft against this team, on this patch, when they had Maokai".

So the page is a filter bar and then folds — record, draft order, game length, both
champion pools, both ban lists, and the matching games themselves. Every section reads the
same `applyScrimFilter(games, filter)` array.

### The filter lives in the URL

`TeamFilterBar` is a client component whose every control does one thing: `router.push` a
new query string. The page re-renders on the server with new `searchParams`, and the
aggregation stays where the rest of this codebase keeps it — in pure functions, on the
server, over rows the page already had.

The alternative (filter state in the component, aggregates recomputed in the browser) would
have meant shipping every game's picks to the client and duplicating the fold. It would
also have made a filtered view unlinkable, and a filtered view is precisely the thing you
send to somebody: *"look at our last three officials on red side"*.

Two consequences worth knowing:

- **Nothing re-queries.** `loadScrimGames` already returns the section's entire dataset for
  every tab, and the demo copy reads it from the same `"scrim-games"` cache entry the other
  demo scrim pages share. A filtered view costs no extra read on either version.
- **The filter is applied in JavaScript, not pushed into PostgREST.** Consistent with
  ADR-015, and here it is not even a trade: a champion filter is a predicate over ten picks
  per game, which SQL would need a join to express, and the dataset is one season of
  hand-entered games.

### Champion pickers search all of DDragon, not just what was played

`champions` comes from the DDragon map rather than from the games. *"Have we ever faced
Ambessa"* is worth being able to ask and get **no** to; a list built from the games
themselves can only ever answer yes.

Adding a champion that is already applied is greyed rather than hidden, the same rule the
draft board uses — a vanishing list entry reads as a bug.

`ChampionChips` is declared at module scope, and not only because `react-hooks/static-components`
says so: a component created during render is a new type each time, so React remounts it,
which would wipe the combobox's typed text on every keystroke that changed the parent. The
deliberate remount (bumping `pickerKey` to clear the box after a pick) only means something
if the accidental one isn't also happening.

### The empty state names the filter, not the data

"No games" on a page whose entire job is narrowing reads as an empty database. The message
says no game matches *every one of these filters*, and points at the per-option counts —
which are over the unfiltered set precisely so they can be read as a way out.
