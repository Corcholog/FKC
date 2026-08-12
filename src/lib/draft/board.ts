// The draft simulator's board, as data.
//
// No React and no I/O in this file on purpose. Everything the board *knows* —
// what's in a slot, what can still be placed, what "empty" means — is plain
// functions over plain objects, which is what makes the component above it a
// layout concern rather than a state machine. There's no test runner yet
// (docs/engineering/10-known-gaps.md §1); this is the module most worth being
// able to test the day there is one, and keeping it pure costs nothing now.
//
// Everything here returns new objects. Nothing mutates.

export const SLOTS_PER_SIDE = 5;

export const SIDES = ["blue", "red"] as const;
export type Side = (typeof SIDES)[number];

export const SLOT_KINDS = ["ban", "pick"] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

/** A slot address. `index` is 0-based within its side and kind. */
export type SlotRef = { side: Side; kind: SlotKind; index: number };

/** null = empty. Always SLOTS_PER_SIDE long. */
export type SlotRow = (number | null)[];

export type GameBoard = {
  bans: Record<Side, SlotRow>;
  picks: Record<Side, SlotRow>;
};

function emptyRow(): SlotRow {
  return Array<number | null>(SLOTS_PER_SIDE).fill(null);
}

export function emptyBoard(): GameBoard {
  return {
    bans: { blue: emptyRow(), red: emptyRow() },
    picks: { blue: emptyRow(), red: emptyRow() },
  };
}

function rowsFor(board: GameBoard, kind: SlotKind): Record<Side, SlotRow> {
  return kind === "ban" ? board.bans : board.picks;
}

export function readSlot(board: GameBoard, ref: SlotRef): number | null {
  return rowsFor(board, ref.kind)[ref.side][ref.index] ?? null;
}

function writeSlot(board: GameBoard, ref: SlotRef, championId: number | null): GameBoard {
  const key = ref.kind === "ban" ? "bans" : "picks";
  return {
    ...board,
    [key]: {
      ...board[key],
      [ref.side]: board[key][ref.side].map((id, i) => (i === ref.index ? championId : id)),
    },
  };
}

/**
 * Puts a champion in a slot, replacing whatever was there.
 *
 * Replacing rather than refusing is what a person means when they click a
 * filled slot with a new champion in mind. The no-duplicates rule is enforced
 * by the grid, which won't offer a champion already on the board — not here,
 * because a caller placing a champion deliberately shouldn't be second-guessed
 * by the data layer.
 */
export function setSlot(board: GameBoard, ref: SlotRef, championId: number): GameBoard {
  return writeSlot(board, ref, championId);
}

export function clearSlot(board: GameBoard, ref: SlotRef): GameBoard {
  return writeSlot(board, ref, null);
}

/** Every champion on this board — bans and picks, both sides, in no order. */
export function boardChampionIds(board: GameBoard): number[] {
  const ids: number[] = [];
  for (const kind of SLOT_KINDS) {
    for (const side of SIDES) {
      for (const id of rowsFor(board, kind)[side]) {
        if (id !== null) ids.push(id);
      }
    }
  }
  return ids;
}

/**
 * Champions that can't be placed on this board right now.
 *
 * A Set because it's queried once per grid tile — about 170 `has` calls per
 * render, which is nothing. Build it once per render in a useMemo keyed on the
 * board and pass it down. That is the entire optimisation story for this
 * component; see the note at the bottom of the phase doc before adding
 * memoisation, virtualisation or any further index.
 *
 * Phase 5 widens this to a whole series: bans don't carry between games but
 * picks do. The signature stays, the body grows.
 */
export function unavailableIds(board: GameBoard): Set<number> {
  return new Set(boardChampionIds(board));
}

/** Whether anything at all has been placed — the Clear button's enabled state. */
export function isBoardEmpty(board: GameBoard): boolean {
  return boardChampionIds(board).length === 0;
}

/**
 * The next empty slot on the same side and kind, wrapping to the start, or null
 * if that row is full.
 *
 * This is what makes filling a side five grid clicks instead of ten alternating
 * ones: place a champion, and the active slot walks to the next hole by itself.
 * Wrapping matters because slots fill in any order — having filled B3 and B4
 * first, advancing from B5 should land on B1 rather than giving up.
 */
export function nextEmptySlot(board: GameBoard, from: SlotRef): SlotRef | null {
  const row = rowsFor(board, from.kind)[from.side];
  for (let step = 1; step <= row.length; step++) {
    const index = (from.index + step) % row.length;
    if (row[index] === null) return { ...from, index };
  }
  return null;
}

/** A stable string for a slot, for React keys and sessionStorage debugging. */
export function slotKey(ref: SlotRef): string {
  return `${ref.side}-${ref.kind}-${ref.index}`;
}

/** "B1", "R3" for picks; "Ban 2" for bans. */
export function slotLabel(ref: SlotRef): string {
  if (ref.kind === "ban") return `Ban ${ref.index + 1}`;
  return `${ref.side === "blue" ? "B" : "R"}${ref.index + 1}`;
}

/**
 * Whether a parsed value is really a GameBoard.
 *
 * sessionStorage is the untrusted input here: a key written by an earlier
 * version of this board is still sitting in the tab, and spreading it into
 * state would crash the render rather than fail cleanly. Checks shape and
 * length, not just presence.
 */
export function isGameBoard(value: unknown): value is GameBoard {
  if (typeof value !== "object" || value === null) return false;
  const board = value as Partial<GameBoard>;
  return SLOT_KINDS.every((kind) => {
    const rows = kind === "ban" ? board.bans : board.picks;
    if (typeof rows !== "object" || rows === null) return false;
    return SIDES.every((side) => {
      const row = (rows as Record<string, unknown>)[side];
      return (
        Array.isArray(row) &&
        row.length === SLOTS_PER_SIDE &&
        row.every((id) => id === null || typeof id === "number")
      );
    });
  });
}
