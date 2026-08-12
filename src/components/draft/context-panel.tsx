"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PanelRight, Pin, PinOff, X } from "lucide-react";
import { isBoardEmpty, SIDES, type GameBoard, type Side } from "@/lib/draft/board";
import { boardContext, type IdLookup } from "@/lib/draft/context";
import {
  CompSection,
  CounterSection,
  ExploreChampions,
  ExploreComps,
  ExploreCounters,
  ExploreSynergies,
  SynergySection,
  TagSection,
  type PanelData,
} from "@/components/draft/context-sections";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type PanelMode = "contextual" | "explore";

const SIDE_LABEL: Record<Side, string> = { blue: "Blue", red: "Red" };

// Where the panel stops overlaying the board and docks beside it. Tailwind's
// `xl`, kept as a literal because matchMedia can't read a Tailwind breakpoint —
// change one and change the other.
const DOCK_QUERY = "(min-width: 1280px)";

// Made once and kept. getSnapshot runs on every render, and a fresh
// MediaQueryList per render is an allocation for a value that never differs.
// Safe as module state because both functions below are client-only: the server
// path is getServerSnapshot, which doesn't touch it.
let dockQuery: MediaQueryList | null = null;

function dockMedia(): MediaQueryList {
  dockQuery ??= window.matchMedia(DOCK_QUERY);
  return dockQuery;
}

function subscribeToDock(onChange: () => void): () => void {
  const query = dockMedia();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True once the viewport is wide enough to dock the panel beside the board.
 *
 * **This is a JS media query where the phase doc called for a CSS one**, and the
 * reason is the Sheet: rendering both mount points and hiding one with
 * `xl:hidden` leaves a base-ui Dialog mounted and open at desktop widths, where
 * it still traps focus and locks scrolling behind a popup nobody can see. So the
 * breakpoint has to be a value the component branches on, not a class.
 *
 * The server snapshot is `false`, so the first render is always the Sheet
 * branch. Nothing flips visibly: the panel starts closed, and a closed Sheet
 * renders nothing at all.
 */
function useDocked(): boolean {
  return useSyncExternalStore(
    subscribeToDock,
    () => dockMedia().matches,
    () => false,
  );
}

/**
 * The board, read back at you.
 *
 * Two modes over the same four tables. **Contextual** filters champions,
 * counters, comps and synergies against whatever is on the visible game.
 * **Explore** shows them unfiltered with a search box each, for looking
 * something up mid-draft.
 *
 * **There is no engine, deliberately.** No scoring, no ranking, no suggestions,
 * no notion of a "good" draft. A scoring function would need weights nobody here
 * could justify, would be confidently wrong against a specific opponent, and
 * would turn the panel's output into something to argue with rather than
 * something to read. Filtered reads have exactly one failure mode — a row that
 * should have matched didn't — and that one is debuggable.
 *
 * **Read-only, likewise.** Every row links to its home page and that is the
 * whole affordance. Editing from here would mean a second write surface into
 * every table, each with its own validation and its own optimistic update
 * against a board that is *also* changing, for a surface you glance at rather
 * than work in.
 */
export function ContextPanel({
  open,
  onOpenChange,
  board,
  unavailable,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The visible game. Switching games in the series re-filters everything. */
  board: GameBoard;
  /**
   * Series-aware unavailability from `unavailableInSeries` — this game's bans
   * and picks *plus* everything carried from earlier games. It has to be the
   * series-aware one: see the note on `nearSynergies`.
   */
  unavailable: IdLookup;
  data: PanelData;
}) {
  const docked = useDocked();
  // Null means "whatever the board implies". A click on either mode button
  // fills it in and it stays filled — see the note where `mode` is derived.
  const [modeChoice, setModeChoice] = useState<PanelMode | null>(null);
  const [ourSide, setOurSide] = useState<Side>("blue");
  const [hovered, setHovered] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  /**
   * Docked, the panel is a rail that opens under the cursor and shoves the board
   * left, rather than a thing you open and close. `open` is therefore a *pin*,
   * not a visibility flag: hover peeks, the pin keeps it.
   *
   * Two states rather than one because either alone is wrong. Hover-only closes
   * the panel the instant you reach for a champion, which is precisely when you
   * were reading it. Click-only makes a glance cost two clicks and leaves the
   * board permanently narrower for people who only wanted to check one thing.
   *
   * (In the sheet below xl there's no room to shove anything, so `open` means
   * what it says and hover plays no part.)
   */
  const expanded = open || hovered;

  const empty = isBoardEmpty(board);

  // Explore while the board is empty — contextual mode would be four empty
  // sections and no way to tell that's expected — then Contextual from the first
  // placement on. Derived rather than synced in an effect: `modeChoice` is the
  // user's answer and null is "hasn't said", so the two can't disagree and there
  // is no render where the mode is stale.
  const mode: PanelMode = modeChoice ?? (empty ? "explore" : "contextual");

  const { ourPicks, theirPicks } = useMemo(() => boardContext(board, ourSide), [board, ourSide]);

  // One object, so the our-side toggle can't reach three sections and miss the
  // fourth — the failure there is silent, and it shows the enemy's counters as
  // yours.
  const contextual = { data, ourPicks, theirPicks, unavailable, ourSide };

  // Two columns once the container is wide enough, not once the *viewport* is:
  // the same sections render at 30rem docked and at a phone's width in the
  // sheet, and a viewport breakpoint would put two columns in a 24rem sheet the
  // moment the phone behind it turned landscape.
  const grid = "grid gap-2 p-2 @md:grid-cols-2";

  const sections =
    mode === "explore" ? (
      // Left as a plain 2x2 — each Explore section is a search box over one
      // table and none of them reads against another, so there's no pairing to
      // preserve the way Contextual has. Two columns rather than four stacked
      // blocks only because the panel is wide enough now that one column of
      // 30rem-wide rows would be mostly whitespace.
      <div className={grid}>
        <ExploreSynergies data={data} />
        <ExploreCounters data={data} />
        <ExploreComps data={data} />
        <ExploreChampions data={data} />
      </div>
    ) : empty ? (
      // One message rather than four empty states. Only reachable by choosing
      // Contextual on an empty board, since that's not the default.
      <div className="flex flex-col items-start gap-2 p-3">
        <p className="text-xs text-grey-mid">
          Nothing on the board yet, so there is nothing to filter against.
        </p>
        <Button type="button" size="xs" variant="outline" onClick={() => setModeChoice("explore")}>
          Browse everything instead
        </Button>
      </div>
    ) : (
      // Synergies and counters share the top row because they're the two reads
      // you make *at* the same moment — "what do we already have" against "what
      // answers what they took" — and comparing them costs a scroll if they're
      // stacked. Comps and tags span the full width below: a comp row is five
      // portraits plus badges and a tag histogram is a bar chart, and both are
      // wider things than a column.
      <div className={grid}>
        <SynergySection {...contextual} />
        <CounterSection {...contextual} />
        <CompSection {...contextual} className="@md:col-span-2" />
        <TagSection {...contextual} className="@md:col-span-2" />
      </div>
    );

  function header(title: React.ReactNode, trailing: React.ReactNode) {
    return (
      <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          {title}
          {trailing}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {(["contextual", "explore"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="xs"
                variant={mode === option ? "default" : "outline"}
                onClick={() => setModeChoice(option)}
                aria-pressed={mode === option}
              >
                {option === "contextual" ? "Contextual" : "Explore"}
              </Button>
            ))}
          </div>

          {/* Only where it means something. In Explore nothing is filtered
              against the board, so "which side is us" has no effect and a live
              control that does nothing is worse than no control. */}
          {mode === "contextual" && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] tracking-wide text-grey-mid uppercase">Us</span>
              {SIDES.map((side) => (
                <Button
                  key={side}
                  type="button"
                  size="xs"
                  variant={ourSide === side ? "default" : "outline"}
                  onClick={() => setOurSide(side)}
                  aria-pressed={ourSide === side}
                  aria-label={`We are ${SIDE_LABEL[side]} side`}
                  className={cn(ourSide !== side && (side === "blue" ? "text-cyan" : "text-loss"))}
                >
                  {SIDE_LABEL[side]}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const scroller = (
    <div className="scrollbar-panel @container min-h-0 flex-1 overflow-y-auto">{sections}</div>
  );

  if (docked) {
    return (
      <>
        {/* The panel is glued to the window's right edge, which is outside the
            max-w-[96rem] shell everything else on this page lives in. So it's
            positioned out of flow, and this — the only thing left in the flex
            row — is what actually pushes the board left.

            It's the *overlap*, not the panel's width: `50vw - 50%` is the gutter
            between the shell and the window edge, and the panel only costs the
            board whatever it can't fit in that gutter. On a 1920px screen a
            collapsed rail fits entirely in the gutter and the board keeps its
            full width; open, the panel needs 30rem and takes the 264px it can't
            find. Below the shell's max width the gutter is just the page's own
            padding and it behaves like an ordinary column. `max(0px, …)` because
            a negative width isn't a thing. */}
        <div
          aria-hidden
          className={cn(
            "shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none",
            expanded
              ? "w-[max(0px,calc(30rem-50vw+50%))]"
              : "w-[max(0px,calc(3.5rem-50vw+50%))]",
          )}
        />
        {/* data-export-hide is belt-and-braces: this sits outside the exported
            element already, and it should keep working if the layout moves.

            The height is the board's height restated, not a share of the
            viewport. A panel that outgrows the board makes the page scroll, and
            not having to scroll to see the board is the whole point of the
            champion grid's own clamp; a reference column that undid it whenever
            a list ran long would be the same bug wearing a hat. So it's that
            clamp plus the 8rem the ban panel and row gaps take: grid
            clamp(21.5rem, 100vh-29.5rem, 36rem) + 8rem. Change one, change the
            other — draft-champion-grid.tsx is where the numbers come from.
            Fixed rather than capped, so the collapsed rail is a full-height
            hover target instead of a stub; overflow lands on the scroller. */}
        <aside
        data-export-hide
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setHovered(true)}
        onBlurCapture={(e) => {
          // Only when focus has actually left the panel — moving between two
          // controls inside it fires a blur with the next one as relatedTarget.
          if (!e.currentTarget.contains(e.relatedTarget)) setHovered(false);
        }}
        className={cn(
          "panel-hex flex h-[clamp(29.5rem,calc(100vh-21.5rem),44rem)] flex-col overflow-hidden p-0",
          // Out of flow and pinned to the window's right edge. `right` is
          // measured from the flex row's padding box — the shell — so the
          // negative gutter walks it out to the glass. top-0 is what keeps it
          // level with the board without anyone hard-coding the height of the
          // navbar, the heading and the tab strip above it.
          "absolute top-0 right-[calc(50%-50vw)]",
          "transition-[width] duration-200 ease-out motion-reduce:transition-none",
          // 3.5rem collapsed rather than the 2.25rem it started at: the rail is
          // the only thing advertising that a whole panel is over here, and at
          // 36px it read as a scrollbar someone forgot to remove.
          expanded ? "w-[30rem]" : "w-14",
        )}
      >
        {expanded ? (
          // Fixed at the expanded width so the content doesn't reflow while the
          // aside animates — the board beside it is already reflowing, and two
          // things relaying out at once for 200ms reads as a stutter. The aside
          // clips it instead.
          <div className="flex min-h-0 w-[30rem] flex-1 flex-col">
            {header(
              <h2 className="font-heading text-sm font-semibold text-white">Draft reference</h2>,
              <Button
                type="button"
                size="icon-sm"
                variant={open ? "default" : "ghost"}
                onClick={() => onOpenChange(!open)}
                aria-pressed={open}
                aria-label={open ? "Unpin the reference panel" : "Keep the reference panel open"}
                title={
                  open
                    ? "Unpin — the panel goes back to opening on hover"
                    : "Pin it open, so it stays while you draft"
                }
                className={cn(!open && "text-grey-mid hover:text-grey-light")}
              >
                {open ? <PinOff /> : <Pin />}
              </Button>,
            )}
            {scroller}
          </div>
        ) : (
          // The rail. Hovering anywhere on it opens the panel; clicking pins it,
          // because hover alone means the panel closes the moment you go back to
          // the board, and reading a list while drafting wants both on screen.
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            aria-label="Open the draft reference panel"
            title="Draft reference — hover to open, click to pin"
            className="flex h-full w-full flex-col items-center gap-3 py-4 text-grey-mid transition-colors hover:text-gold"
          >
            <PanelRight className="size-5 shrink-0" />
            <span className="text-[11px] tracking-widest uppercase [writing-mode:vertical-rl]">
              Reference
            </span>
          </button>
        )}
        </aside>
      </>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Focus the panel itself rather than its first control — same reason the
          navbar's menu does it: Explore mode opens with a search box at the top,
          and autofocusing it pops the keyboard on a phone the moment the panel
          appears. */}
      <SheetContent
        ref={sheetRef}
        initialFocus={sheetRef}
        side="right"
        showCloseButton={false}
        data-export-hide
        className="gap-0 bg-bg-secondary p-0"
      >
        {header(
          <SheetTitle className="text-sm font-semibold">Draft reference</SheetTitle>,
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            aria-label="Close the reference panel"
            className="text-grey-mid hover:text-grey-light"
          >
            <X />
          </Button>,
        )}
        {scroller}
      </SheetContent>
    </Sheet>
  );
}
