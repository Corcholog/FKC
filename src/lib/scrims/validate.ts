// Server-side validation for an entered series.
//
// Lives here rather than inside the action for the same reason normalizeTiers
// lives in lib/tierlist.ts: a "use server" module may only export async server
// functions, so anything in there is unreachable from a test or another caller.
// The action imports this and stays a thin wrapper around the write.
//
// This is the copy that counts. Server actions are reachable by direct POST,
// not only through our own form, so none of it may lean on the UI having
// prevented something. The form runs its own lighter pass first purely so the
// user hears about an empty field before a round trip.

import {
  BANS_PER_SIDE,
  MAX_GAMES_PER_SERIES,
  SCRIM_KINDS,
  SCRIM_ROLES,
  SCRIM_SIDES,
} from "@/lib/scrims/types";

export const MAX_NOTE_CHARS = 2000;
export const MAX_NAME_CHARS = 80;
/** Six hours. Anything longer is a typo, not a game. */
export const MAX_DURATION_SECONDS = 6 * 60 * 60;
export const MAX_STAT = 1000;

export type ScrimPickInput = {
  ally: boolean;
  teamPosition: string;
  championId: number;
  /** Roster player id for an ally; null for a substitute or any enemy. */
  playerId: string | null;
  /** Substitute name or enemy nickname. Optional everywhere. */
  playerName: string | null;
  kills: number;
  deaths: number;
  assists: number;
  totalCs: number;
};

export type ScrimGameInput = {
  side: (typeof SCRIM_SIDES)[number];
  win: boolean;
  durationSeconds: number | null;
  allyBans: number[];
  enemyBans: number[];
  notes: string | null;
  picks: ScrimPickInput[];
};

export type ScrimSeriesInput = {
  /** Existing opponent, or null when `opponentName` should create one. */
  opponentId: string | null;
  opponentName: string;
  playedOn: string;
  kind: (typeof SCRIM_KINDS)[number];
  fearless: boolean;
  notes: string | null;
  games: ScrimGameInput[];
};

export function cleanText(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function isWholeNumber(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

/** The first thing wrong with this series, or null if it's sound. */
export function validateSeries(
  input: ScrimSeriesInput,
  validChampionIds: Set<number>,
): string | null {
  if (!input.opponentId && !cleanText(input.opponentName, MAX_NAME_CHARS)) {
    return "Pick an opponent, or type a name for a new one.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.playedOn)) return "That date isn't valid.";
  if (!SCRIM_KINDS.includes(input.kind)) return "Unknown series type.";

  if (input.games.length === 0) return "A series needs at least one game.";
  if (input.games.length > MAX_GAMES_PER_SERIES) {
    return `A series can hold at most ${MAX_GAMES_PER_SERIES} games.`;
  }

  for (const [index, game] of input.games.entries()) {
    const label = `Game ${index + 1}`;

    if (!SCRIM_SIDES.includes(game.side)) return `${label}: pick blue or red side.`;
    if (typeof game.win !== "boolean") return `${label}: pick a result.`;
    if (
      game.durationSeconds !== null &&
      !(isWholeNumber(game.durationSeconds, MAX_DURATION_SECONDS) && game.durationSeconds > 0)
    ) {
      return `${label}: that duration isn't valid.`;
    }

    for (const [side, bans] of [
      ["our", game.allyBans],
      ["their", game.enemyBans],
    ] as const) {
      if (bans.length > BANS_PER_SIDE) {
        return `${label}: ${side} bans max out at ${BANS_PER_SIDE}.`;
      }
      for (const id of bans) {
        if (!validChampionIds.has(id)) {
          return `${label}: ${side} bans include a champion I don't know.`;
        }
      }
    }

    // Ten picks, one per role per side. The database enforces the uniqueness
    // too, but a constraint violation surfaces as an opaque Postgres string —
    // catching it here is what makes the message readable.
    if (game.picks.length !== SCRIM_ROLES.length * 2) {
      return `${label}: needs all ten picks (five a side).`;
    }
    for (const ally of [true, false]) {
      const roles = game.picks.filter((p) => p.ally === ally).map((p) => p.teamPosition);
      const missing = SCRIM_ROLES.filter((role) => !roles.includes(role));
      if (missing.length > 0 || roles.length !== SCRIM_ROLES.length) {
        return `${label}: ${ally ? "our" : "their"} draft is missing a role.`;
      }
    }

    for (const pick of game.picks) {
      if (!validChampionIds.has(pick.championId)) {
        return `${label}: a pick is set to a champion I don't know.`;
      }
      if (
        !isWholeNumber(pick.kills, MAX_STAT) ||
        !isWholeNumber(pick.deaths, MAX_STAT) ||
        !isWholeNumber(pick.assists, MAX_STAT) ||
        !isWholeNumber(pick.totalCs, MAX_STAT)
      ) {
        return `${label}: K/D/A and CS have to be whole numbers.`;
      }
    }

    // Within one game a champion is picked once or banned once, never both and
    // never twice — that's the draft rule, and a violation means a row was
    // filled in twice by mistake.
    //
    // Fearless is deliberately *not* checked: the rules differ between
    // organisers, and rejecting a legitimately-played game is worse than
    // accepting an odd-looking one. The entry form greys used champions out
    // instead, which guides without refusing.
    const used = [...game.picks.map((p) => p.championId), ...game.allyBans, ...game.enemyBans];
    if (new Set(used).size !== used.length) {
      return `${label}: the same champion is picked or banned twice.`;
    }
  }

  return null;
}
