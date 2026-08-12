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

// ------------------------------------------------------------
// Fearless series
// ------------------------------------------------------------
// Five, not the ten lib/scrims/types.ts allows. That limit exists because the
// scrim_games_number check constraint does and hand-entry shouldn't fight the
// database; nothing is written from here, and no series this team plays is
// longer than a Bo5. Five buttons fit in a row, ten are noise. A Bo7 is one
// constant away.

export const MAX_GAMES = 5;

/** Index 0 is game 1. Always MAX_GAMES long; unplayed games are empty boards. */
export type SeriesBoard = GameBoard[];

export function emptySeries(): SeriesBoard {
  return Array.from({ length: MAX_GAMES }, emptyBoard);
}

/** Every pick of one game, both sides. Bans excluded — see carriedPicks. */
function pickedInGame(board: GameBoard): number[] {
  return SIDES.flatMap((side) => board.picks[side].filter((id): id is number => id !== null));
}

/**
 * Champions picked in games *before* `gameIndex`, mapped to the 1-based number
 * of the earliest game each appeared in — so the grid can say "G1" rather than
 * just "unavailable".
 *
 * **Bans deliberately do not carry.** Fearless removes champions that were
 * *played*; one banned in game 1 and never played is back on the table in game
 * 2, to pick or to ban again. That asymmetry is the entire format, and it's the
 * one thing on this board a person cannot verify by looking — which is why it
 * lives here as its own function rather than inline in a component. Same rule
 * and same reasoning as usedEarlierInSeries in scrims/draft-form-state.ts; if
 * an organiser ever counts bans too, these are the two functions that change.
 *
 * "Earlier" is `j < gameIndex`, not `j !== gameIndex`. The second is easier to
 * write, is wrong, and only shows up when someone goes back to fix game 1 after
 * filling game 3 — the series is played forwards but edited in any order.
 */
export function carriedPicks(series: SeriesBoard, gameIndex: number): Map<number, number> {
  const carried = new Map<number, number>();
  for (let j = 0; j < gameIndex && j < series.length; j++) {
    for (const id of pickedInGame(series[j])) {
      // Ascending, and first write wins, so a champion played in G1 and G2
      // reads as G1 — the game that actually took it out of the pool.
      if (!carried.has(id)) carried.set(id, j + 1);
    }
  }
  return carried;
}

/**
 * Why a champion can't be placed in `gameIndex`.
 *
 * Two states, and conflating them makes the board lie by omission: a champion
 * greyed because someone just banned it this game is a different situation from
 * one greyed because your mid laner played it in game 1. Both are equally
 * unclickable; only the label differs.
 */
export type UnavailableReason = { kind: "taken" } | { kind: "carried"; game: number };

/**
 * Everything unavailable in `gameIndex`, with the reason for each.
 *
 * Composed from the single-game rule plus the carried set rather than written
 * out, so the two halves stay separately readable — `unavailableIds` is the
 * "this game" half and is still used on its own.
 *
 * `fearless` off makes every game independent. Not every series is fearless;
 * `scrim_series.fearless` exists as a column for exactly that reason.
 */
export function unavailableInSeries(
  series: SeriesBoard,
  gameIndex: number,
  fearless = true,
): Map<number, UnavailableReason> {
  const reasons = new Map<number, UnavailableReason>();

  if (fearless) {
    for (const [id, game] of carriedPicks(series, gameIndex)) {
      reasons.set(id, { kind: "carried", game });
    }
  }
  // This game's own bans and picks last, so they win the label: a champion
  // picked in G1 *and* again in this game reads as "taken", which is the
  // reason you can act on.
  for (const id of unavailableIds(series[gameIndex] ?? emptyBoard())) {
    reasons.set(id, { kind: "taken" });
  }

  return reasons;
}

/**
 * The picks of one side, in slot order (B1…B5), empties preserved as null.
 *
 * Not compacted, for two reasons: a comp stores pick order and that's real
 * information about how the draft was meant to go (see the champion_ids comment
 * in migration 017), and keeping the holes lets the caller say *which* slot is
 * missing rather than only that one is.
 */
export function sidePicks(board: GameBoard, side: Side): (number | null)[] {
  return [...board.picks[side]];
}

/** The same, with the holes dropped — what a save actually writes. */
export function filledSidePicks(board: GameBoard, side: Side): number[] {
  return sidePicks(board, side).filter((id): id is number => id !== null);
}

/**
 * Games *after* `gameIndex` where `championId` already sits in a slot, as
 * 1-based game numbers.
 *
 * The counterpart to carriedPicks, and the reason it has to exist: the fearless
 * rule only looks backwards, so nothing stops someone opening G1 and placing a
 * champion that G3 already picked. The board would then hold the same champion
 * in two games of a format whose entire premise is that it can't — and neither
 * game's grid would show a problem, because each is only checking the games
 * before it.
 *
 * Bans count too, not just picks. Once a champion is picked in an earlier game
 * it's in `unavailableInSeries` for every later one, which blocks ban slots as
 * well as pick slots — so a later *ban* of it is the same inconsistency.
 */
export function conflictsAfter(
  series: SeriesBoard,
  gameIndex: number,
  championId: number,
): number[] {
  const games: number[] = [];
  for (let j = gameIndex + 1; j < series.length; j++) {
    if (boardChampionIds(series[j]).includes(championId)) games.push(j + 1);
  }
  return games;
}

/**
 * Removes `championId` from every slot of every game after `gameIndex`.
 *
 * Deliberately surgical: it takes out the one champion causing the conflict and
 * leaves the rest of those drafts standing. Clearing whole games would also
 * resolve it, and there's an argument for it — a fearless game drafted against
 * a pool that has since changed is arguably stale — but most edits to an
 * earlier game are fixing a typo, and losing three drafted games to a typo is
 * the worse failure.
 */
export function releaseChampionAfter(
  series: SeriesBoard,
  gameIndex: number,
  championId: number,
): SeriesBoard {
  return series.map((board, j) => {
    if (j <= gameIndex) return board;
    const strip = (row: SlotRow) => row.map((id) => (id === championId ? null : id));
    return {
      bans: { blue: strip(board.bans.blue), red: strip(board.bans.red) },
      picks: { blue: strip(board.picks.blue), red: strip(board.picks.red) },
    };
  });
}

/**
 * How many slots each game has filled — which games "clear series" would
 * actually take, so its confirmation can name a number.
 */
export function gameFillCounts(series: SeriesBoard): number[] {
  return series.map((board) => boardChampionIds(board).length);
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
export function isSeriesBoard(value: unknown): value is SeriesBoard {
  return Array.isArray(value) && value.length === MAX_GAMES && value.every(isGameBoard);
}

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
