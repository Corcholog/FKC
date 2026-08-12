"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ChampionInfo } from "@/lib/ddragon";
import type { ChampionProfileRow } from "@/lib/draft/types";
import {
  clearSlot,
  emptyBoard,
  emptySeries,
  gameFillCounts,
  isBoardEmpty,
  isSeriesBoard,
  MAX_GAMES,
  nextEmptySlot,
  readSlot,
  setSlot,
  slotKey,
  slotLabel,
  SLOTS_PER_SIDE,
  unavailableInSeries,
  type GameBoard,
  type SeriesBoard,
  type Side,
  type SlotKind,
  type SlotRef,
} from "@/lib/draft/board";
import { DraftChampionGrid } from "@/components/draft/draft-champion-grid";
import { DraftControls } from "@/components/draft/draft-controls";
import { DraftSlot } from "@/components/draft/draft-slot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };

const BOARD_ELEMENT_ID = "draft-board";

// Bumped from draft-board-v1 rather than migrated. A Phase 4 payload has
// bans/picks at the top level and would read as series[0] being undefined; the
// shape check rejects it and we start empty, which is the right outcome for a
// tab someone left open across a deploy.
const STORAGE_KEY = "draft-series-v1";
const STALE_KEYS = ["draft-board-v1"];

type StoredState = { series: SeriesBoard; currentGame: number; fearless: boolean };

function isStoredState(value: unknown): value is StoredState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<StoredState>;
  return (
    isSeriesBoard(v.series) &&
    typeof v.currentGame === "number" &&
    v.currentGame >= 0 &&
    v.currentGame < MAX_GAMES &&
    typeof v.fearless === "boolean"
  );
}

// Coloured literally, matching scrims/scrim-ui.tsx — this is the one place in
// League where "blue" and "red" name a thing rather than describe it, and the
// app already answers cyan/loss for that pair.
const SIDE_COPY: Record<Side, { label: string; accent: string }> = {
  blue: { label: "Blue", accent: "text-cyan" },
  red: { label: "Red", accent: "text-loss" },
};

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

const NEVER_CHANGES = () => () => {};

/**
 * False on the server and through hydration, true afterwards.
 *
 * The point is to give the server and the first client render the same answer,
 * so anything that can only be known in the browser — sessionStorage, here —
 * is read *after* hydration has matched rather than during it. Both snapshots
 * are stable primitives and the store never notifies, so this settles once and
 * never again.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

/** The stored series, or null if there isn't a usable one. */
function readStoredState(): StoredState | null {
  try {
    for (const key of STALE_KEYS) sessionStorage.removeItem(key);

    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isStoredState(parsed)) return parsed;
    // Written by an earlier version of this component. Spreading it into state
    // would crash the render, so drop it rather than carry it.
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Unparseable, or storage disabled entirely. An empty series is fine.
  }
  return null;
}

/**
 * The draft scratchpad at /draft.
 *
 * **There is no turn machine, deliberately.** A real draft is fifteen
 * alternating actions across two ban phases, and encoding that would mean the
 * board refuses clicks while someone is trying to sketch "what if they take
 * this at R1". Any slot is fillable at any time in any order. The 3 + 2 gap in
 * the ban rows is the only nod to real draft structure and it is purely how the
 * row is drawn — see the comment where the gap is applied.
 *
 * State is a five-game series, which game is on screen, whether fearless is on,
 * and the active slot. No reducer, no context, no store — this codebase has
 * none and doesn't want one (ADR-019).
 *
 * **One game renders at a time.** Mounting five boards and hiding four would be
 * five champion grids and a hundred slots in the DOM for no gain, and it breaks
 * the PNG export silently: toPng resolves the element id to whichever board
 * matches first, which may not be the one on screen.
 */
export function DraftSimulator({
  champions,
  version,
  profiles,
}: {
  champions: Champion[];
  version: string;
  /** Phase 1's annotations, for the grid's role filter. */
  profiles: ChampionProfileRow[];
}) {
  const [series, setSeries] = useState<SeriesBoard>(emptySeries);
  const [currentGame, setCurrentGame] = useState(0);
  const [fearless, setFearless] = useState(true);
  const [active, setActive] = useState<SlotRef | null>(null);
  const [restored, setRestored] = useState(false);
  const hydrated = useHydrated();

  const board = series[currentGame];

  const championById = useMemo(
    () => new Map(champions.map((c) => [c.championId, c])),
    [champions],
  );
  const unavailable = useMemo(
    () => unavailableInSeries(series, currentGame, fearless),
    [series, currentGame, fearless],
  );
  const fillCounts = useMemo(() => gameFillCounts(series), [series]);

  // Rehydration happens *during render*, once, rather than in an effect.
  //
  // It can't go in useState's initialiser: that runs on the server too, where
  // sessionStorage doesn't exist, and a board that differs between the server
  // and the first client render is a hydration mismatch. It can't go in an
  // effect either — react-hooks/set-state-in-effect, correctly, since that's a
  // second render pass after paint. Adjusting state during render is the
  // sanctioned third option and the same pattern champion-profile-table.tsx
  // uses to resync from a changed prop: React discards this render and redoes
  // it immediately, before anything reaches the screen.
  if (hydrated && !restored) {
    setRestored(true);
    const stored = readStoredState();
    if (stored) {
      setSeries(stored.series);
      setCurrentGame(stored.currentGame);
      setFearless(stored.fearless);
    }
  }

  // Guarded on `restored` so the empty first render doesn't overwrite a stored
  // series before the read above has had a chance to run.
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ series, currentGame, fearless }));
    } catch {
      // Private mode or a full quota. The board still works for this session.
    }
  }, [series, currentGame, fearless, restored]);

  /** Replaces the game on screen, leaving the rest of the series alone. */
  function updateGame(change: (board: GameBoard) => GameBoard) {
    setSeries((prev) => prev.map((game, i) => (i === currentGame ? change(game) : game)));
  }

  function pick(championId: number) {
    if (!active) return;
    const slot = active;
    updateGame((prev) => {
      const next = setSlot(prev, slot, championId);
      // Advance after placing, computed against the *new* board so the slot
      // just filled isn't offered back. This is what makes filling a side five
      // grid clicks rather than ten alternating ones.
      setActive(nextEmptySlot(next, slot) ?? slot);
      return next;
    });
  }

  function clearOne(slot: SlotRef) {
    updateGame((prev) => clearSlot(prev, slot));
  }

  function clearGame() {
    updateGame(() => emptyBoard());
    setActive(null);
  }

  function clearSeries() {
    setSeries(emptySeries());
    setActive(null);
  }

  function renderRow(side: Side, kind: SlotKind) {
    return Array.from({ length: SLOTS_PER_SIDE }, (_, index) => {
      const slot: SlotRef = { side, kind, index };
      const championId = readSlot(board, slot);
      return (
        <DraftSlot
          key={slotKey(slot)}
          slot={slot}
          champion={
            championId === null ? null : (championById.get(championId) ?? null)
          }
          version={version}
          active={active !== null && slotKey(active) === slotKey(slot)}
          onActivate={() => setActive(slot)}
          onClear={() => clearOne(slot)}
        />
      );
    });
  }

  function banRow(side: Side) {
    const slots = renderRow(side, "ban");
    // The 3 + 2 split is *only* how the row is drawn — a gap so it reads the
    // way a real draft looks. There is no phase-one/phase-two logic behind it,
    // no ordering rule and no gating. It looks like state and isn't.
    return (
      <div
        className={cn(
          "flex items-start gap-1",
          side === "red" && "flex-row-reverse",
        )}
      >
        <div className="flex gap-1">{slots.slice(0, 3)}</div>
        <div className="flex gap-1">{slots.slice(3)}</div>
      </div>
    );
  }

  function gameSwitcher() {
    return (
      // Not data-export-hide: which game this is belongs in the image, and the
      // active button is the only thing that says so.
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_GAMES }, (_, i) => (
            <Button
              key={i}
              type="button"
              size="sm"
              variant={i === currentGame ? "default" : "outline"}
              onClick={() => {
                setCurrentGame(i);
                // The old active slot belongs to the game we just left; keeping
                // it would send the next grid click into a board nobody is
                // looking at.
                setActive(null);
              }}
              aria-pressed={i === currentGame}
              aria-label={`Game ${i + 1}${fillCounts[i] > 0 ? `, ${fillCounts[i]} filled` : ", empty"}`}
            >
              G{i + 1}
              {/* So an untouched G4 is visibly untouched from G1, without
                  having to switch to it and back. */}
              {fillCounts[i] > 0 && (
                <span className="ml-1 text-[10px] tabular-nums opacity-70">{fillCounts[i]}</span>
              )}
            </Button>
          ))}
        </div>

        <Button
          type="button"
          size="sm"
          variant={fearless ? "default" : "outline"}
          onClick={() => setFearless((f) => !f)}
          aria-pressed={fearless}
          title={
            fearless
              ? "Picks from earlier games are unavailable"
              : "Every game draws from the full pool"
          }
          data-export-hide
        >
          Fearless
        </Button>
      </div>
    );
  }

  function pickColumn(side: Side) {
    return (
      // A side-coloured wash fading toward the grid. Blue and red are the one
      // place in League where a colour names a thing rather than decorates it
      // — scrims/scrim-ui.tsx makes the same call — and it's what stops the two
      // flanks reading as identical grey columns in an exported PNG.
      //
      // Kept at 15%: gold is this app's interaction colour (the active ring,
      // the tile glow) and a saturated panel behind a gold ring goes muddy.
      // Picks only, never the bans row — those are already desaturated and
      // struck through, and colour behind them is noise.
      <div
        className={cn(
          "flex flex-col gap-1 rounded-sm px-2 py-1",
          side === "blue"
            ? "bg-linear-to-r from-cyan/15 to-transparent"
            : "bg-linear-to-l from-loss/15 to-transparent",
        )}
      >
        <h3
          className={cn(
            "text-[10px] font-medium tracking-wide uppercase",
            SIDE_COPY[side].accent,
            side === "red" && "text-right",
          )}
        >
          {SIDE_COPY[side].label}
        </h3>
        {/* From md up the flanks stretch to the grid's height (the row's
            align-items defaults to stretch) and justify-between spreads the
            five slots across it, so a side reads as one column rather than a
            short stack floating beside a tall panel. Below md they're a
            wrapping row above and below the grid instead. */}
        <div className="flex flex-row flex-wrap gap-1 md:flex-1 md:flex-col md:justify-between">
          {renderRow(side, "pick")}
        </div>
      </div>
    );
  }

  return (
    // Everything inside this id is what the PNG captures — which is now
    // everything, controls included, so each piece of chrome has to opt out
    // for itself with data-export-hide rather than by sitting outside.
    //
    // The attribute has to be spelled kebab-case: the DOM lowercases attribute
    // names, so data-exportHide arrives as data-exporthide and reads back as
    // dataset.exporthide — which download-png-button's filter, checking
    // dataset.exportHide, never sees. It would have exported every bit of
    // chrome silently, and React's "spell it lowercase" warning is the only
    // thing that says so.
    <div id={BOARD_ELEMENT_ID} className="flex flex-col gap-3">
      {/* Centred, not spread. justify-between pinned the two sides to
            opposite edges of a max-w-7xl panel with a canyon of nothing in
            between — §11's scrim board learned the same lesson and capped
            itself for the same reason: a face-off reads as a face-off when the
            two sides are near each other.

            Three columns rather than a flex row with the controls appended:
            the empty first column mirrors the controls' width, so the bans stay
            centred on the panel instead of being pushed left by them. The
            controls ride along in this panel's corner because they needed no
            vertical space of their own — a full row for two buttons was the
            cheapest thing on the page to give back to the grid. */}
      <div className="panel-hex grid grid-cols-[1fr_auto_1fr] items-start gap-2 p-3">
        <div className="flex justify-start">{gameSwitcher()}</div>
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {banRow("blue")}
          <span className="text-[10px] tracking-wider text-grey-mid uppercase">Bans</span>
          {banRow("red")}
        </div>
        <div className="flex justify-end">
          <DraftControls
            boardElementId={BOARD_ELEMENT_ID}
            fileName={`draft-g${currentGame + 1}-${todayStamp()}.png`}
            gameNumber={currentGame + 1}
            canClearGame={!isBoardEmpty(board)}
            gamesWithContent={fillCounts.filter((n) => n > 0).length}
            onClearGame={clearGame}
            onClearSeries={clearSeries}
          />
        </div>
      </div>

      {/* No md:items-start — the default stretch is what lets the pick
            columns match the grid's height. */}
      <div className="flex flex-col gap-3 md:flex-row">
        {pickColumn("blue")}
        <div className="min-w-0 flex-1">
          <DraftChampionGrid
            champions={champions}
            version={version}
            unavailable={unavailable}
            profiles={profiles}
            onPick={pick}
            activeSlotLabel={active ? slotLabel(active) : null}
          />
        </div>
        {pickColumn("red")}
      </div>
    </div>
  );
}
