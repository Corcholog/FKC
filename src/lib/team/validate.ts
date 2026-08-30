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
  TEAM_MATCH_KINDS,
  TEAM_ROLES,
  TEAM_SIDES,
} from "@/lib/team/types";

export const MAX_NOTE_CHARS = 2000;
export const MAX_NAME_CHARS = 80;
/**
 * "15.3" is four. Ten leaves room for a three-digit season, a two-digit patch
 * and whatever suffix an organiser invents, and stops a paragraph landing in
 * the column that a filter dropdown enumerates.
 */
export const MAX_PATCH_CHARS = 10;
// Long enough for "Playoffs Quarter-final", short enough that nobody writes a
// paragraph into a label the filter dropdown has to render.
export const MAX_STAGE_CHARS = 60;
/** Six hours. Anything longer is a typo, not a game. */
export const MAX_DURATION_SECONDS = 6 * 60 * 60;
export const MAX_STAT = 1000;

export type TeamPickInput = {
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

export type TeamGameInput = {
  /**
   * The saved row this game already is, when a series is being *edited*. Null
   * for a game being added, and ignored entirely by saveTeamSeries, where
   * every game is new.
   *
   * Carrying it is what lets an edit update a game in place instead of
   * recreating it — which matters because team_game_notes hangs off
   * team_games.id with `on delete cascade`. See updateTeamSeries.
   */
  id?: string | null;
  side: (typeof TEAM_SIDES)[number];
  win: boolean;
  durationSeconds: number | null;
  /** "15.3", or null. Prefilled by the form; see MAX_PATCH_CHARS. */
  patch: string | null;
  allyBans: number[];
  enemyBans: number[];
  /**
   * A note typed while entering the game. Stored as the first row of the
   * game's note thread rather than on the game itself — see
   * docs/migrations/013_team_game_notes.sql.
   */
  notes: string | null;
  picks: TeamPickInput[];
};

export type TeamSeriesInput = {
  /** Existing opponent, or null when `opponentName` should create one. */
  opponentId: string | null;
  opponentName: string;
  playedOn: string;
  kind: (typeof TEAM_MATCH_KINDS)[number];
  fearless: boolean;
  notes: string | null;
  /**
   * The tournament this belongs to, for officials. Null everywhere else.
   *
   * Not tied to `kind` by a constraint: a friendly against a team you also meet
   * in the tournament is a real thing, and rejecting it would be worse than
   * storing an odd-looking row. The form is what only offers the field on an
   * official.
   */
  competitionId: string | null;
  /** "Fecha 3", "Playoffs QF". Free text; see MAX_STAGE_CHARS. */
  stage: string | null;
  games: TeamGameInput[];
};

export function cleanText(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function isWholeNumber(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

/**
 * A ban plan, cleaned rather than rejected.
 *
 * Unlike a series, nothing here is a claim about what happened — it is a list
 * somebody is assembling — so a duplicate or an unknown id is a slip to drop,
 * not an error to report back. The check constraint in migration 020 enforces
 * the ceiling in the database; this keeps a direct POST from ever reaching it,
 * and keeps the order, which is the priority.
 */
export function cleanBanPlan(
  ids: unknown,
  validChampionIds: Set<number>,
  max: number = BANS_PER_SIDE,
): number[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<number>();
  const plan: number[] = [];
  for (const id of ids) {
    if (!isWholeNumber(id, Number.MAX_SAFE_INTEGER) || id === 0) continue;
    if (seen.has(id) || !validChampionIds.has(id)) continue;
    seen.add(id);
    plan.push(id);
    if (plan.length === max) break;
  }
  return plan;
}

/** The first thing wrong with this series, or null if it's sound. */
export function validateSeries(
  input: TeamSeriesInput,
  validChampionIds: Set<number>,
): string | null {
  if (!input.opponentId && !cleanText(input.opponentName, MAX_NAME_CHARS)) {
    return "Pick an opponent, or type a name for a new one.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.playedOn)) return "That date isn't valid.";
  if (!TEAM_MATCH_KINDS.includes(input.kind)) return "Unknown series type.";

  // A stage without a competition names a round of nothing. The reverse is
  // fine — plenty of fixtures are just "we played them in LIDE 2".
  if (input.stage && !input.competitionId) {
    return "Pick a competition, or leave the stage blank.";
  }

  if (input.games.length === 0) return "A series needs at least one game.";
  if (input.games.length > MAX_GAMES_PER_SERIES) {
    return `A series can hold at most ${MAX_GAMES_PER_SERIES} games.`;
  }

  for (const [index, game] of input.games.entries()) {
    const label = `Game ${index + 1}`;

    if (!TEAM_SIDES.includes(game.side)) return `${label}: pick blue or red side.`;
    if (typeof game.win !== "boolean") return `${label}: pick a result.`;
    if (
      game.durationSeconds !== null &&
      !(isWholeNumber(game.durationSeconds, MAX_DURATION_SECONDS) && game.durationSeconds > 0)
    ) {
      return `${label}: that duration isn't valid.`;
    }
    // Shape rather than membership: patches arrive faster than any list we
    // could keep, and rejecting a real one is worse than storing an odd one.
    // What this does catch is a value that would fragment the filter — a date,
    // a note, an empty string that isn't null.
    if (game.patch !== null) {
      if (typeof game.patch !== "string" || game.patch.trim() !== game.patch) {
        return `${label}: that patch isn't valid.`;
      }
      if (game.patch.length === 0 || game.patch.length > MAX_PATCH_CHARS) {
        return `${label}: write the patch as a number like 15.3, or leave it blank.`;
      }
      if (!/^\d+\.\d+/.test(game.patch)) {
        return `${label}: write the patch as a number like 15.3, or leave it blank.`;
      }
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
    if (game.picks.length !== TEAM_ROLES.length * 2) {
      return `${label}: needs all ten picks (five a side).`;
    }
    for (const ally of [true, false]) {
      const roles = game.picks.filter((p) => p.ally === ally).map((p) => p.teamPosition);
      const missing = TEAM_ROLES.filter((role) => !roles.includes(role));
      if (missing.length > 0 || roles.length !== TEAM_ROLES.length) {
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
