// The team, and the order it is read in.
//
// Membership used to be a question this module answered: 026 made it
// `players.team_role is not null`, and every team surface carried that
// predicate. 028 made the column `not null unique`, so the table *is* the team
// and the predicate has nothing to exclude — five rows, one per position.
//
// What is left here is the ordering (a team sorted alphabetically is sorted
// wrong), the full-stack test the sync gates flex on, and the folds over flex
// rows. All of it is pure except `loadTeamRoster`, which takes a DataSource so
// the queue is the caller's choice.

import { rows } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import { TEAM_ROLES, type TeamRole } from "@/lib/team/types";

/**
 * How many of the team have to be in a Riot game before it counts as the team
 * playing it. Five, and not configurable: "the team" is five people on the map,
 * which is a fact about League and not a preference. Since 028 it is also the
 * size of the `players` table, enforced there.
 */
export const FULL_STACK = 5;

/** Top → Jungle → Mid → ADC → Support. `TEAM_ROLES` is already in that order. */
export const TEAM_ROLE_ORDER: readonly TeamRole[] = TEAM_ROLES;

const ROLE_RANK = new Map<string, number>(TEAM_ROLE_ORDER.map((role, i) => [role, i]));

export type TeamMember = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  team_role: TeamRole;
  // The best of their accounts' soloQ rank, mirrored onto `players` by the sync.
  // Carried here rather than fetched again per surface: the roster is five rows,
  // every list of them shows a rank, and a second query for three columns is a
  // round trip to save nothing.
  tier: string | null;
  division: string | null;
  league_points: number | null;
};

/**
 * Role order, then name.
 *
 * The name tie-break costs nothing and keeps this a *total* order, so a row with
 * a role the app doesn't know (a hand-written update, a future rename) sorts to
 * the end deterministically instead of moving between renders.
 */
export function sortTeamMembers<T extends { team_role: string | null; display_name: string }>(
  members: T[],
): T[] {
  return [...members].sort(
    (a, b) =>
      (ROLE_RANK.get(a.team_role ?? "") ?? Number.MAX_SAFE_INTEGER) -
        (ROLE_RANK.get(b.team_role ?? "") ?? Number.MAX_SAFE_INTEGER) ||
      a.display_name.localeCompare(b.display_name),
  );
}

export const TEAM_MEMBER_COLUMNS =
  "id, slug, display_name, avatar_url, team_role, tier, division, league_points";

/**
 * The team, in role order.
 *
 * No predicate: since 028 every row in `players` is on the team, and a filter
 * that is always true is one more thing a future page can get wrong while
 * looking right.
 */
export async function loadTeamRoster(source: DataSource): Promise<TeamMember[]> {
  const result = rows(
    await source.supabase
      .from(source.table("players"))
      .select(TEAM_MEMBER_COLUMNS)
      .returns<TeamMember[]>(),
    "team roster",
  );

  return sortTeamMembers(result);
}

/** Name lookups keyed by player id — the shape every team view already takes. */
export function teamMemberLookup(
  members: TeamMember[],
): Map<string, { display_name: string; slug: string }> {
  return new Map(members.map((m) => [m.id, { display_name: m.display_name, slug: m.slug }]));
}

// ------------------------------------------------------------
// Was this Riot game the team's?
// ------------------------------------------------------------

/** The shape the sync has in hand: one row per participant, resolved to a player. */
export type SideMember = { teamId: number; playerId: string | null };

/**
 * Whether five of the main team were on one side of a Riot game.
 *
 * Counts **distinct players**, not accounts and not participant rows, which is
 * what makes it right when somebody queues on their soloQ main instead of the
 * account the team usually flexes on — it is the same person in the same seat.
 *
 * `teamPlayerIds` is the roster as of *now*, which is the honest reading and
 * also the one with a consequence: a game is judged by today's five, not by
 * whoever was on the team the day it was played. See the sync for what that
 * means and how to recover it.
 */
export function isFullStack(participants: SideMember[], teamPlayerIds: Set<string>): boolean {
  const perSide = new Map<number, Set<string>>();
  for (const p of participants) {
    if (!p.playerId || !teamPlayerIds.has(p.playerId)) continue;
    const seen = perSide.get(p.teamId) ?? new Set<string>();
    seen.add(p.playerId);
    perSide.set(p.teamId, seen);
  }
  for (const seen of perSide.values()) {
    if (seen.size >= FULL_STACK) return true;
  }
  return false;
}

export type TeamRecord = { games: number; wins: number; losses: number; winRate: number };

/** A record over anything that knows whether it was won. */
export function recordOf(games: { win: boolean }[]): TeamRecord {
  const wins = games.filter((g) => g.win).length;
  return {
    games: games.length,
    wins,
    losses: games.length - wins,
    // Rounded like every other win rate in the app, so two panels on one page
    // never disagree by a decimal.
    winRate: games.length === 0 ? 0 : Math.round((wins / games.length) * 100),
  };
}

// ------------------------------------------------------------
// Flex games, grouped
// ------------------------------------------------------------

/** One flex participant row, as far as grouping cares. */
export type FlexGameInput = {
  match_id: string;
  player_id: string | null;
  team_id: number;
  win: boolean;
  game_creation: string;
  game_duration_seconds: number;
};

export type FlexGame = {
  matchId: string;
  gameCreation: string;
  durationSeconds: number;
  /** Which side the team was on. */
  teamId: number;
  /** The team members who played it. */
  playerIds: string[];
  /** The team's result. Unambiguous, because only their games are stored. */
  win: boolean;
};

/**
 * Flex participant rows folded back into games, one entry each.
 *
 * There used to be a three-way split here — full stack, partial stack, civil
 * war — because any flex game with one tracked player was stored, and each of
 * those was a different claim about the team. The sync now stores a flex game
 * only when five of the team were on one side, so the other two cases cannot
 * reach this: a partial stack is never written, and with five of the team on
 * one side of a ten-player game there are at most five slots left for the rest
 * of the roster, so "the team on both sides" would need the team to be the
 * whole lobby.
 *
 * A sixth member subbing in *can* put one team member on the far side, which is
 * why "our side" is still the side with more of them rather than the side with
 * any.
 */
export function groupFlexGames(
  rows: FlexGameInput[],
  teamPlayerIds: Set<string>,
): FlexGame[] {
  const byMatch = new Map<string, FlexGameInput[]>();
  for (const row of rows) {
    const list = byMatch.get(row.match_id);
    if (list) list.push(row);
    else byMatch.set(row.match_id, [row]);
  }

  const games: FlexGame[] = [];
  for (const [matchId, participants] of byMatch) {
    const perSide = new Map<number, FlexGameInput[]>();
    for (const row of participants) {
      if (!row.player_id || !teamPlayerIds.has(row.player_id)) continue;
      const list = perSide.get(row.team_id);
      if (list) list.push(row);
      else perSide.set(row.team_id, [row]);
    }
    // No team member at all means this row predates the gate, or the roster
    // changed under it. Either way there is no "us" to tell it from.
    if (perSide.size === 0) continue;

    // Ties break to the lower team id, so the same match always renders the
    // same way round.
    const [teamId, ours] = [...perSide.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0] - b[0],
    )[0];

    games.push({
      matchId,
      gameCreation: ours[0].game_creation,
      durationSeconds: ours[0].game_duration_seconds,
      teamId,
      playerIds: ours.map((p) => p.player_id as string),
      win: ours[0].win,
    });
  }

  return games.sort((a, b) => b.gameCreation.localeCompare(a.gameCreation));
}

/**
 * How many of these games each player was in.
 *
 * Answers "who actually turns up" — a five-stack needs five people and the
 * fifth is not always the same one, so a roster with a substitute has a clear
 * first choice and someone who fills in.
 */
export function flexAppearances(games: FlexGame[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const game of games) {
    for (const id of game.playerIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
