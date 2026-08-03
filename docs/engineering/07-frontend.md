# 07 — Frontend

## 1. Route structure

```
src/app/
├── layout.tsx                Root: fonts, <Toaster />. No auth logic.
├── login/page.tsx            The only public route. "use client".
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
    ├── notes/                No page.tsx, so no route — just the note CRUD server
    │   ├── actions.ts        actions and their form-state type, shared by every
    │   └── form-state.ts     surface that renders a match row.
    ├── settings/             Roster CRUD, Riot key, AI context, logins
    └── account/page.tsx      Password change
```

The `(app)` route group is what lets one layout wrap every authenticated page without
adding an `/app` prefix to any URL. `/login` sits outside it precisely so it doesn't get
the navbar.

**Every page except `/login` is a Server Component.** No `"use client"`, no `useEffect`
data fetching, no loading state management. Client components exist only where
interactivity genuinely requires them.

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
