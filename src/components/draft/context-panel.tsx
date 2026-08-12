"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
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
  const sheetRef = useRef<HTMLDivElement>(null);

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

  const sections =
    mode === "explore" ? (
      <>
        <ExploreSynergies data={data} />
        <ExploreCounters data={data} />
        <ExploreComps data={data} />
        <ExploreChampions data={data} />
      </>
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
      <>
        <SynergySection {...contextual} />
        <CounterSection {...contextual} />
        <CompSection {...contextual} />
        <TagSection {...contextual} />
      </>
    );

  function header(title: React.ReactNode) {
    return (
      <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          {title}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            aria-label="Close the reference panel"
            className="text-grey-mid hover:text-grey-light"
          >
            <X />
          </Button>
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

  const scroller = <div className="min-h-0 flex-1 overflow-y-auto">{sections}</div>;

  if (docked) {
    if (!open) return null;
    return (
      // data-export-hide is belt-and-braces: this sits outside the exported
      // element already, and it should keep working if the board's layout moves.
      //
      // The height is the *board's* height, restated — not a share of the
      // viewport. A panel that outgrows the board makes the page scroll, and
      // "don't make me scroll to see the board" is the constraint the champion
      // grid's own clamp() exists to satisfy; a reference column that undoes it
      // whenever a list runs long would be the same bug wearing a hat. So this
      // is that clamp plus the 8rem the ban panel and the row gaps take:
      // grid clamp(21.5rem, 100vh-29.5rem, 36rem) + 8rem. Change one, change
      // the other — see draft-champion-grid.tsx for where the numbers come from.
      // Overflow lands on the scroller inside instead.
      <aside
        data-export-hide
        className="panel-hex flex max-h-[clamp(29.5rem,calc(100vh-21.5rem),44rem)] w-80 shrink-0 flex-col overflow-hidden p-0"
      >
        {header(<h2 className="font-heading text-sm font-semibold text-white">Draft reference</h2>)}
        {scroller}
      </aside>
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
        {header(<SheetTitle className="text-sm font-semibold">Draft reference</SheetTitle>)}
        {scroller}
      </SheetContent>
    </Sheet>
  );
}
