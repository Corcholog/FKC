"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ChampionInfo } from "@/lib/ddragon";
import type { ChampionProfileRow } from "@/lib/draft/types";
import {
  clearSlot,
  emptyBoard,
  isBoardEmpty,
  isGameBoard,
  nextEmptySlot,
  readSlot,
  setSlot,
  slotKey,
  slotLabel,
  SLOTS_PER_SIDE,
  unavailableIds,
  type GameBoard,
  type Side,
  type SlotKind,
  type SlotRef,
} from "@/lib/draft/board";
import { DraftChampionGrid } from "@/components/draft/draft-champion-grid";
import { DraftControls } from "@/components/draft/draft-controls";
import { DraftSlot } from "@/components/draft/draft-slot";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };

const BOARD_ELEMENT_ID = "draft-board";
const STORAGE_KEY = "draft-board-v1";

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

/** The stored board, or null if there isn't a usable one. */
function readStoredBoard(): GameBoard | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isGameBoard(parsed)) return parsed;
    // A key left by an earlier version of this board. Spreading it into state
    // would crash the render, so drop it rather than carry it.
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Unparseable, or storage disabled entirely. An empty board is fine.
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
 * State is one board plus one active slot. No reducer, no context, no store —
 * this codebase has none and doesn't want one (ADR-019).
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
  const [board, setBoard] = useState<GameBoard>(emptyBoard);
  const [active, setActive] = useState<SlotRef | null>(null);
  const [restored, setRestored] = useState(false);
  const hydrated = useHydrated();

  const championById = useMemo(
    () => new Map(champions.map((c) => [c.championId, c])),
    [champions],
  );
  const unavailable = useMemo(() => unavailableIds(board), [board]);

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
    const stored = readStoredBoard();
    if (stored) setBoard(stored);
  }

  // Guarded on `restored` so the empty first render doesn't overwrite a stored
  // board before the read above has had a chance to run.
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    } catch {
      // Private mode or a full quota. The board still works for this session.
    }
  }, [board, restored]);

  function pick(championId: number) {
    if (!active) return;
    setBoard((prev) => {
      const next = setSlot(prev, active, championId);
      // Advance after placing, computed against the *new* board so the slot
      // just filled isn't offered back. This is what makes filling a side five
      // grid clicks rather than ten alternating ones.
      setActive(nextEmptySlot(next, active) ?? active);
      return next;
    });
  }

  function clearOne(slot: SlotRef) {
    setBoard((prev) => clearSlot(prev, slot));
  }

  function clearAll() {
    setBoard(emptyBoard());
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
          champion={championId === null ? null : (championById.get(championId) ?? null)}
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
      <div className={cn("flex items-start gap-1", side === "red" && "flex-row-reverse")}>
        <div className="flex gap-1">{slots.slice(0, 3)}</div>
        <div className="flex gap-1">{slots.slice(3)}</div>
      </div>
    );
  }

  function pickColumn(side: Side) {
    return (
      <div className="flex flex-col gap-1">
        <h3
          className={cn(
            "text-[10px] font-medium tracking-wide uppercase",
            SIDE_COPY[side].accent,
            side === "red" && "text-right",
          )}
        >
          {SIDE_COPY[side].label}
        </h3>
        <div className="flex flex-row flex-wrap gap-1 md:flex-col">{renderRow(side, "pick")}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Everything inside this id is what the PNG captures. Chrome within it
          carries data-export-hide; the controls row below sits outside entirely.

          The attribute has to be spelled kebab-case: the DOM lowercases
          attribute names, so data-exportHide arrives as data-exporthide and
          reads back as dataset.exporthide — which download-png-button's filter,
          checking dataset.exportHide, never sees. It would have exported every
          bit of chrome silently, and React's "spell it lowercase" warning is
          the only thing that says so. */}
      <div id={BOARD_ELEMENT_ID} className="flex flex-col gap-3">
        {/* Centred, not spread. justify-between pinned the two sides to
            opposite edges of a max-w-7xl panel with a canyon of nothing in
            between — §11's scrim board learned the same lesson and capped
            itself for the same reason: a face-off reads as a face-off when the
            two sides are near each other. Nothing is being reserved here for
            the fearless switcher; that lands as its own control. */}
        <div className="panel-hex flex flex-wrap items-center justify-center gap-x-6 gap-y-3 p-3">
          {banRow("blue")}
          <span className="text-[10px] tracking-wider text-grey-mid uppercase">Bans</span>
          {banRow("red")}
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-start">
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

      <div data-export-hide>
        <DraftControls
          boardElementId={BOARD_ELEMENT_ID}
          fileName={`draft-${todayStamp()}.png`}
          canClear={!isBoardEmpty(board)}
          onClear={clearAll}
        />
      </div>
    </div>
  );
}
