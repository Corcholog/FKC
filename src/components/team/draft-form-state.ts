// State shape and parsing for the team-match entry form.
//
// Kept out of the component so the fiddly parts — duration parsing, what counts
// as "already used", turning form strings into the action's payload — are
// testable plain functions rather than closures inside a 400-line client
// component.

import {
  BANS_PER_SIDE,
  TEAM_ROLES,
  type TeamGameView,
  type TeamRole,
  type TeamSide,
} from "@/lib/team/types";
import type { TeamGameInput, TeamPickInput, TeamSeriesInput } from "@/lib/team/validate";

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
  /**
   * The saved row this game is, when editing an existing series. Null for a
   * game being added, and for every game in the new-series form.
   */
  id: string | null;
  side: TeamSide;
  win: boolean;
  /** "32:14", or "32" for whole minutes. Empty is allowed. */
  duration: string;
  /**
   * "15.3". Prefilled from the current DDragon version on a new game, because a
   * patch field nobody fills is worse than no field — an optional text input
   * next to nine required ones gets skipped, and then "how did we look on this
   * patch" is unanswerable forever. Editable, since a series is sometimes
   * entered days late.
   */
  patch: string;
  allyBans: Array<number | null>;
  enemyBans: Array<number | null>;
  /** Optional. Saved as the opening note in this game's thread, not on the game. */
  notes: string;
  ally: Record<TeamRole, PickState>;
  enemy: Record<TeamRole, PickState>;
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

export function emptyGame(
  side: TeamSide,
  lineup: Record<TeamRole, string | null>,
  patch = "",
): GameState {
  const forSide = (allies: boolean) =>
    Object.fromEntries(
      TEAM_ROLES.map((role) => [role, emptyPick(allies ? lineup[role] : null)]),
    ) as Record<TeamRole, PickState>;

  return {
    key: newGameKey(),
    id: null,
    side,
    win: true,
    duration: "",
    patch,
    allyBans: Array<number | null>(BANS_PER_SIDE).fill(null),
    enemyBans: Array<number | null>(BANS_PER_SIDE).fill(null),
    notes: "",
    ally: forSide(true),
    enemy: forSide(false),
  };
}

/**
 * A saved game as form state, for editing a series that already exists.
 *
 * The exact inverse of what the form does on the way out: stored numbers become
 * the strings the inputs hold, and the ban arrays are padded back to five slots
 * so a game recorded with three bans still shows five boxes.
 *
 * `notes` stays empty because it isn't part of an edit — a game's notes are an
 * authored thread on the series page, not a field of the game, so the edit form
 * hides the box rather than offering one that writes nothing.
 */
export function gameStateFromView(game: TeamGameView): GameState {
  const bans = (stored: number[]): Array<number | null> =>
    Array.from({ length: BANS_PER_SIDE }, (_, i) => stored[i] ?? null);

  const draft = (ally: boolean): Record<TeamRole, PickState> => {
    const byRole = new Map(
      game.picks.filter((p) => p.ally === ally).map((p) => [p.team_position, p]),
    );

    return Object.fromEntries(
      TEAM_ROLES.map((role) => {
        const pick = byRole.get(role);
        // A missing role is unreachable through the form — ten picks are
        // required — but a half-written game shouldn't be the one game nobody
        // can open the editor on to fix.
        if (!pick) return [role, emptyPick()];

        return [
          role,
          {
            championId: pick.champion_id,
            // Enemy rows have no roster player, and storing one would show a
            // teammate's name on their draft.
            playerId: ally ? pick.player_id : null,
            playerName: pick.player_name ?? "",
            kills: String(pick.kills),
            deaths: String(pick.deaths),
            assists: String(pick.assists),
            totalCs: String(pick.total_cs),
          } satisfies PickState,
        ];
      }),
    ) as Record<TeamRole, PickState>;
  };

  return {
    // The row id doubles as the React key: unique already, and stable across
    // the removal of any other game.
    key: game.id,
    id: game.id,
    side: game.side,
    win: game.win,
    duration: formatDurationInput(game.duration_seconds),
    // Not defaulted to the current patch here, unlike a new game: an old series
    // being edited was played on whatever patch it was played on, and guessing
    // today's would be inventing data on rows that predate the field.
    patch: game.patch ?? "",
    allyBans: bans(game.ally_bans),
    enemyBans: bans(game.enemy_bans),
    notes: "",
    ally: draft(true),
    enemy: draft(false),
  };
}

export function otherSide(side: TeamSide): TeamSide {
  return side === "blue" ? "red" : "blue";
}

/**
 * The same game with the two drafts the other way round — for when the wrong
 * team was entered as ours.
 *
 * The side toggle only relabels the columns, so correcting a mixed-up game
 * meant retyping twenty fields. This is the correction: sides flip, bans trade
 * places, and every champion and stat line moves across with them.
 *
 * The one thing that stays put is who is in each of our seats. The roster
 * dropdowns say which of *our players* held top, jungle and so on, which is
 * true whichever side of the map we were on — so the performances move and the
 * lineup doesn't. Free-text names travel with the performance they describe,
 * since they were only ever labels for those numbers.
 *
 * Swapping twice leaves the game exactly as it was. That is worth keeping:
 * anything else would make the button destructive to click twice, on a form
 * whose whole point is that a wrong guess can be undone.
 */
export function swapTeams(game: GameState): GameState {
  const swapRole = (role: TeamRole) => {
    const ours = game.ally[role];
    const theirs = game.enemy[role];
    return [
      { ...theirs, playerId: ours.playerId },
      { ...ours, playerId: theirs.playerId },
    ] as const;
  };

  const swapped = TEAM_ROLES.map((role) => [role, swapRole(role)] as const);

  return {
    ...game,
    side: otherSide(game.side),
    allyBans: game.enemyBans,
    enemyBans: game.allyBans,
    ally: Object.fromEntries(swapped.map(([role, [ours]]) => [role, ours])) as Record<
      TeamRole,
      PickState
    >,
    enemy: Object.fromEntries(swapped.map(([role, [, theirs]]) => [role, theirs])) as Record<
      TeamRole,
      PickState
    >,
  };
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
  for (const role of TEAM_ROLES) {
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

function toPickInput(role: TeamRole, ally: boolean, pick: PickState): TeamPickInput {
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
  | { ok: true; payload: TeamSeriesInput }
  | { ok: false; error: string };

/** Everything the form holds: the fields above the games, and the games. */
export type SeriesFormState = {
  opponentId: string | null;
  opponentName: string;
  playedOn: string;
  kind: TeamSeriesInput["kind"];
  fearless: boolean;
  notes: string;
  /**
   * Held even while `kind` is not "official", so switching a series to a scrim
   * and back doesn't lose what was typed. buildSeriesPayload is what drops
   * them; the form only decides whether to show the fields.
   */
  competitionId: string;
  stage: string;
  games: GameState[];
};

/**
 * Turns the form into the action's payload, refusing anything incomplete.
 *
 * This duplicates part of the server's validation on purpose: the server's copy
 * is the one that counts (actions are reachable by direct POST), but finding
 * out about an empty champion field *before* a round trip is the difference
 * between a form that feels solid and one that feels like it's arguing.
 */
export function buildSeriesPayload({ games, ...meta }: SeriesFormState): BuildResult {
  if (!meta.opponentId && !meta.opponentName.trim()) {
    return { ok: false, error: "Pick an opponent, or type a name for a new one." };
  }
  if (!meta.playedOn) return { ok: false, error: "Pick the date the series was played." };
  if (games.length === 0) return { ok: false, error: "Add at least one game." };

  const gameInputs: TeamGameInput[] = [];

  for (const [index, game] of games.entries()) {
    const label = `Game ${index + 1}`;

    const durationSeconds = parseDuration(game.duration);
    if (durationSeconds === undefined) {
      return { ok: false, error: `${label}: write the duration as mm:ss, or leave it blank.` };
    }

    const picks: TeamPickInput[] = [];
    for (const ally of [true, false]) {
      for (const role of TEAM_ROLES) {
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
      // Null on a new game, which is every game when entering a series.
      id: game.id,
      side: game.side,
      win: game.win,
      durationSeconds,
      patch: game.patch.trim() || null,
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
      // Only an official carries these. Sending them on a scrim would store a
      // competition on a game that was never part of one, which is exactly the
      // attribution the tournament filter has to be able to trust.
      competitionId: meta.kind === "official" ? meta.competitionId || null : null,
      stage: meta.kind === "official" ? meta.stage.trim() || null : null,
      games: gameInputs,
    },
  };
}

// ------------------------------------------------------------
// Has anything actually changed?
// ------------------------------------------------------------

/**
 * The whole form as one comparable string.
 *
 * "Is there unsaved work here?" is this string against the one taken when the
 * form opened — which means an edit that ends up back where it started stops
 * counting as a change, and nobody is warned about undoing their own typo.
 *
 * Not `JSON.stringify(state)`. That would compare a *shape*: key order decides
 * the result, and `key` — the React identity of a row, regenerated every time a
 * game is added — would read as content. So everything is written out
 * positionally, and only the parts a save would actually store are included:
 *
 *   * `key` is left out, being identity rather than content
 *   * the strings are trimmed, since trailing space in a name is not an edit
 *   * a typed new-opponent name only counts while "New team…" is selected —
 *     text left behind in a field that no longer applies changes nothing
 */
export function formSignature(form: SeriesFormState): string {
  const pick = (p: PickState) => [
    p.championId,
    p.playerId,
    p.playerName.trim(),
    p.kills.trim(),
    p.deaths.trim(),
    p.assists.trim(),
    p.totalCs.trim(),
  ];

  return JSON.stringify([
    form.opponentId,
    form.opponentId === null ? form.opponentName.trim() : "",
    form.playedOn,
    form.kind,
    form.fearless,
    form.notes.trim(),
    form.games.map((game) => [
      game.id,
      game.side,
      game.win,
      game.duration.trim(),
      game.patch.trim(),
      game.allyBans,
      game.enemyBans,
      game.notes.trim(),
      TEAM_ROLES.map((role) => pick(game.ally[role])),
      TEAM_ROLES.map((role) => pick(game.enemy[role])),
    ]),
  ]);
}
