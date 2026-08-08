// State shape and parsing for the scrim entry form.
//
// Kept out of the component so the fiddly parts — duration parsing, what counts
// as "already used", turning form strings into the action's payload — are
// testable plain functions rather than closures inside a 400-line client
// component.

import { BANS_PER_SIDE, SCRIM_ROLES, type ScrimRole, type ScrimSide } from "@/lib/scrims/types";
import type { ScrimGameInput, ScrimPickInput, ScrimSeriesInput } from "@/lib/scrims/validate";

/** Numbers live as strings while being typed: "" is a real state, 0 isn't. */
export type PickState = {
  championId: number | null;
  /** Roster player for an ally row; null means "someone else", named below. */
  playerId: string | null;
  playerName: string;
  kills: string;
  deaths: string;
  assists: string;
  totalCs: string;
};

export type GameState = {
  /** Stable across reorders so React keys — and field remounts — behave. */
  key: string;
  side: ScrimSide;
  win: boolean;
  /** "32:14", or "32" for whole minutes. Empty is allowed. */
  duration: string;
  allyBans: Array<number | null>;
  enemyBans: Array<number | null>;
  notes: string;
  ally: Record<ScrimRole, PickState>;
  enemy: Record<ScrimRole, PickState>;
};

export function emptyPick(playerId: string | null = null): PickState {
  return {
    championId: null,
    playerId,
    playerName: "",
    kills: "",
    deaths: "",
    assists: "",
    totalCs: "",
  };
}

let gameKeySeed = 0;
export function newGameKey(): string {
  gameKeySeed += 1;
  return `game-${gameKeySeed}`;
}

export function emptyGame(side: ScrimSide, lineup: Record<ScrimRole, string | null>): GameState {
  const forSide = (allies: boolean) =>
    Object.fromEntries(
      SCRIM_ROLES.map((role) => [role, emptyPick(allies ? lineup[role] : null)]),
    ) as Record<ScrimRole, PickState>;

  return {
    key: newGameKey(),
    side,
    win: true,
    duration: "",
    allyBans: Array<number | null>(BANS_PER_SIDE).fill(null),
    enemyBans: Array<number | null>(BANS_PER_SIDE).fill(null),
    notes: "",
    ally: forSide(true),
    enemy: forSide(false),
  };
}

export function otherSide(side: ScrimSide): ScrimSide {
  return side === "blue" ? "red" : "blue";
}

// ------------------------------------------------------------
// Duration
// ------------------------------------------------------------

/**
 * Accepts "32:14" and bare minutes ("32"), because both are things people
 * actually type off the end-of-game screen. Empty is valid and means unknown —
 * the CS/min column simply skips that game.
 *
 * Returns `undefined` for input that isn't either, so the caller can complain
 * rather than silently storing a wrong number.
 */
export function parseDuration(raw: string): number | null | undefined {
  const value = raw.trim();
  if (!value) return null;

  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(value);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  if (/^\d{1,3}$/.test(value)) return Number(value) * 60;

  return undefined;
}

export function formatDurationInput(seconds: number | null): string {
  if (seconds === null) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ------------------------------------------------------------
// Champion availability
// ------------------------------------------------------------

/** The ten champions picked in one game, ignoring bans. */
export function pickedInGame(game: GameState): Set<number> {
  const picked = new Set<number>();
  for (const role of SCRIM_ROLES) {
    if (game.ally[role].championId !== null) picked.add(game.ally[role].championId as number);
    if (game.enemy[role].championId !== null) picked.add(game.enemy[role].championId as number);
  }
  return picked;
}

/**
 * Every champion already spoken for *within* one game — both drafts and all ten
 * bans. Inside a single game a champion can't be picked twice, banned twice, or
 * picked and banned, so all twenty slots compete for the same pool.
 *
 * Used to grey the picker, so the most common entry mistake (the same champion
 * on both teams because a row was filled twice) can't be made rather than being
 * caught by the server after twenty fields of typing.
 */
export function usedInGame(game: GameState): Set<number> {
  const used = pickedInGame(game);
  for (const id of [...game.allyBans, ...game.enemyBans]) if (id !== null) used.add(id);
  return used;
}

/**
 * Champions unavailable in a fearless series — the ones *played* in the games
 * before this one.
 *
 * Bans deliberately do not carry over. Fearless removes champions that were
 * picked; a champion banned in game 1 and never played is still available in
 * game 2, to pick *or* to ban again. (This is the rule the roster actually plays
 * under. Some organisers count bans too — if you ever run into that format, this
 * is the single function that would change.)
 */
export function usedEarlierInSeries(games: GameState[], upTo: number): Set<number> {
  const used = new Set<number>();
  for (const game of games.slice(0, upTo)) {
    for (const id of pickedInGame(game)) used.add(id);
  }
  return used;
}

// ------------------------------------------------------------
// Form state -> action payload
// ------------------------------------------------------------

const toStat = (raw: string): number => {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

function toPickInput(role: ScrimRole, ally: boolean, pick: PickState): ScrimPickInput {
  return {
    ally,
    teamPosition: role,
    championId: pick.championId as number,
    playerId: ally ? pick.playerId : null,
    playerName: pick.playerName.trim() || null,
    kills: toStat(pick.kills),
    deaths: toStat(pick.deaths),
    assists: toStat(pick.assists),
    totalCs: toStat(pick.totalCs),
  };
}

export type BuildResult =
  | { ok: true; payload: ScrimSeriesInput }
  | { ok: false; error: string };

/**
 * Turns the form into the action's payload, refusing anything incomplete.
 *
 * This duplicates part of the server's validation on purpose: the server's copy
 * is the one that counts (actions are reachable by direct POST), but finding
 * out about an empty champion field *before* a round trip is the difference
 * between a form that feels solid and one that feels like it's arguing.
 */
export function buildSeriesPayload(
  meta: {
    opponentId: string | null;
    opponentName: string;
    playedOn: string;
    kind: ScrimSeriesInput["kind"];
    fearless: boolean;
    notes: string;
  },
  games: GameState[],
): BuildResult {
  if (!meta.opponentId && !meta.opponentName.trim()) {
    return { ok: false, error: "Pick an opponent, or type a name for a new one." };
  }
  if (!meta.playedOn) return { ok: false, error: "Pick the date the series was played." };
  if (games.length === 0) return { ok: false, error: "Add at least one game." };

  const gameInputs: ScrimGameInput[] = [];

  for (const [index, game] of games.entries()) {
    const label = `Game ${index + 1}`;

    const durationSeconds = parseDuration(game.duration);
    if (durationSeconds === undefined) {
      return { ok: false, error: `${label}: write the duration as mm:ss, or leave it blank.` };
    }

    const picks: ScrimPickInput[] = [];
    for (const ally of [true, false]) {
      for (const role of SCRIM_ROLES) {
        const pick = ally ? game.ally[role] : game.enemy[role];
        if (pick.championId === null) {
          return {
            ok: false,
            error: `${label}: ${ally ? "our" : "their"} ${role.toLowerCase()} has no champion.`,
          };
        }
        picks.push(toPickInput(role, ally, pick));
      }
    }

    gameInputs.push({
      side: game.side,
      win: game.win,
      durationSeconds,
      allyBans: game.allyBans.filter((id): id is number => id !== null),
      enemyBans: game.enemyBans.filter((id): id is number => id !== null),
      notes: game.notes.trim() || null,
      picks,
    });
  }

  return {
    ok: true,
    payload: {
      opponentId: meta.opponentId,
      opponentName: meta.opponentName,
      playedOn: meta.playedOn,
      kind: meta.kind,
      fearless: meta.fearless,
      notes: meta.notes.trim() || null,
      games: gameInputs,
    },
  };
}
