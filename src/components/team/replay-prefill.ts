// Turning a parsed replay into the form state the series form holds.
//
// Kept apart from lib/team/rofl.ts on the same line the rest of this folder
// draws: that module knows the file format and nothing about this app, and this
// one knows the form and nothing about bytes. It is also the half with all the
// judgement calls in it — which team was ours, which of our players is in which
// slot — so it is worth being able to reason about on its own.
//
// Everything here *prefills*. A replay is a better first guess than an empty
// field, not an authority: every value it writes is a field somebody can
// immediately correct, so the rule throughout is to improve on what is there
// and never to replace a good answer with a worse one.

import { patchFromVersion } from "@/lib/ddragon";
import { TEAM_ROLES, type TeamRole, type TeamSide } from "@/lib/team/types";
import type { RoflPlayer, RoflReplay } from "@/lib/team/rofl";
import { formatDurationInput, type GameState, type PickState } from "./draft-form-state";

export type ReplayContext = {
  /** Lowercased DDragon id ("monkeyking") to champion id. Case folds because Riot's own casing doesn't agree with DDragon's. */
  championIdByKey: Map<string, number>;
  /** Lowercased "name#tag" to roster player id. */
  rosterByRiotId: Map<string, string>;
};

export type ReplayFill = {
  game: GameState;
  /** Things worth saying out loud about this game, already prefixed with which game it was. */
  warnings: string[];
  /**
   * The riot ids of whoever this *recognised* as us — empty when it had to
   * fall back on the side already selected.
   *
   * A block is five people playing five games, so once one game identifies our
   * accounts the rest of the drop can lean on it: a sub coming in for the one
   * player whose account we know doesn't cost the rest of the series.
   *
   * Nothing learned from a guess, though. Feeding a fallback back in would turn
   * one coin flip into five games confidently entered the wrong way round.
   */
  allyRiotIds: string[];
};

/**
 * Which side of this replay was us, or null if there's no way to tell.
 *
 * The only real evidence is the accounts: a roster player's Riot ID, or one
 * already recognised as ours earlier in the same drop. Teams often scrim on
 * accounts this app has never seen, so "no idea" is a normal answer and the
 * caller falls back to the side already selected on the game.
 */
export function detectOurSide(
  replay: RoflReplay,
  rosterByRiotId: Map<string, string>,
  knownAllyRiotIds: ReadonlySet<string>,
): TeamSide | null {
  let blue = 0;
  let red = 0;
  for (const player of replay.players) {
    if (!rosterByRiotId.has(player.riotId) && !knownAllyRiotIds.has(player.riotId)) continue;
    if (player.side === "blue") blue += 1;
    else red += 1;
  }
  // A tie includes the usual case of nothing matching at all. Guessing on one
  // recognised account against one other would be worse than not guessing.
  if (blue === red) return null;
  return blue > red ? "blue" : "red";
}

/**
 * A player as their name goes into the form: `"Peluca#LAS"`.
 *
 * The tag line is worth carrying even though nothing displays it in full.
 * Scouting derives the other team's roster from these names — there is no
 * opponent-player table — so the difference between a nickname and a Riot ID is
 * the difference between "some toplaner called Peluca" and one account we can
 * follow across a season, however they spell themselves next time.
 *
 * Falls back to the bare name for a file that somehow has no tag, rather than
 * writing a trailing "#".
 */
function displayRiotId(player: RoflPlayer): string {
  return player.tagLine ? `${player.gameName}#${player.tagLine}` : player.gameName;
}

/**
 * Five players in role order.
 *
 * TEAM_POSITION is filled in on every normal game, so the first pass is a
 * lookup. The second exists for the games where it isn't — an early remake, an
 * unusual queue — and puts whoever is left into whatever roles are left rather
 * than dropping them, so the picks still land somewhere correctable.
 */
function byRole(players: RoflPlayer[]): Record<TeamRole, RoflPlayer | null> {
  const slots = Object.fromEntries(TEAM_ROLES.map((role) => [role, null])) as Record<
    TeamRole,
    RoflPlayer | null
  >;

  const leftover: RoflPlayer[] = [];
  for (const player of players) {
    const role = player.role as TeamRole;
    if (TEAM_ROLES.includes(role) && slots[role] === null) slots[role] = player;
    else leftover.push(player);
  }

  for (const role of TEAM_ROLES) {
    if (slots[role] === null) slots[role] = leftover.shift() ?? null;
  }
  return slots;
}

/**
 * One player's row, with the roster assignment handled differently on each side.
 *
 * Ours: a Riot ID that matches the roster is the strongest thing this feature
 * knows, so it wins outright. A miss leaves the slot alone — the form seeds the
 * lineup from the last series, and that guess is worth more than a raw Riot ID
 * would be. The one exception is a slot that is empty in both fields, where a
 * name is strictly better than nothing.
 *
 * Theirs: we never track their accounts, so their Riot ID is the best label
 * available and simply goes in.
 */
function toPickState(
  previous: PickState,
  player: RoflPlayer | null,
  ally: boolean,
  ctx: ReplayContext,
): { pick: PickState; unknownChampion: string | null } {
  if (!player) return { pick: previous, unknownChampion: null };

  const championId = ctx.championIdByKey.get(player.championKey.toLowerCase()) ?? null;
  const rosterId = ally ? ctx.rosterByRiotId.get(player.riotId) ?? null : null;

  const identity: Pick<PickState, "playerId" | "playerName"> = ally
    ? rosterId
      ? { playerId: rosterId, playerName: "" }
      : previous.playerId === null && previous.playerName.trim() === ""
        ? { playerId: null, playerName: displayRiotId(player) }
        : { playerId: previous.playerId, playerName: previous.playerName }
    : { playerId: null, playerName: displayRiotId(player) };

  return {
    pick: {
      ...identity,
      // A champion this app can't place leaves the field empty rather than
      // wrong — an empty combobox is the one thing the form already refuses to
      // save, so it can't be missed.
      championId,
      kills: String(player.kills),
      deaths: String(player.deaths),
      assists: String(player.assists),
      totalCs: String(player.totalCs),
    },
    unknownChampion: championId === null ? player.championKey : null,
  };
}

/**
 * A game, filled in from a replay.
 *
 * Returns a new GameState rather than mutating: `key` and `id` carry through
 * untouched, so filling a saved game from a replay still updates that row in
 * place — and its note thread survives — instead of being a delete and an
 * insert. Bans carry through too, because a replay does not record them.
 */
export function fillGameFromReplay(
  game: GameState,
  replay: RoflReplay,
  ctx: ReplayContext,
  knownAllyRiotIds: ReadonlySet<string>,
  label: string,
): ReplayFill {
  const warnings: string[] = [];

  const detected = detectOurSide(replay, ctx.rosterByRiotId, knownAllyRiotIds);
  const ourSide = detected ?? game.side;
  if (detected === null) {
    warnings.push(
      `${label}: none of the accounts are ones I know, so I filled ${ourSide} side as ours.`,
    );
  }

  const ours = byRole(replay.players.filter((p) => p.side === ourSide));
  const theirs = byRole(replay.players.filter((p) => p.side !== ourSide));

  const unknownChampions: string[] = [];
  const draft = (side: Record<TeamRole, RoflPlayer | null>, ally: boolean) =>
    Object.fromEntries(
      TEAM_ROLES.map((role) => {
        const { pick, unknownChampion } = toPickState(
          ally ? game.ally[role] : game.enemy[role],
          side[role],
          ally,
          ctx,
        );
        if (unknownChampion) unknownChampions.push(unknownChampion);
        return [role, pick];
      }),
    ) as Record<TeamRole, PickState>;

  const ally = draft(ours, true);
  const enemy = draft(theirs, false);

  if (unknownChampions.length > 0) {
    warnings.push(
      `${label}: left ${[...new Set(unknownChampions)].join(", ")} blank — not on the current patch's champion list.`,
    );
  }

  const winner = TEAM_ROLES.map((role) => ours[role]).find((p) => p !== null);

  return {
    game: {
      ...game,
      side: ourSide,
      win: winner?.win ?? game.win,
      // A replay with no length is a file that couldn't say; keeping whatever
      // was typed beats overwriting it with 0:00.
      duration:
        replay.durationSeconds > 0 ? formatDurationInput(replay.durationSeconds) : game.duration,
      // The build number the game ran on is the most reliable patch this app
      // will ever have for a scrim — better than the DDragon version the form
      // prefills, which is only right while the series is entered the same week.
      patch: replay.gameVersion ? patchFromVersion(replay.gameVersion) : game.patch,
      ally,
      enemy,
    },
    warnings,
    allyRiotIds:
      detected === null
        ? []
        : replay.players.filter((p) => p.side === ourSide).map((p) => p.riotId),
  };
}
