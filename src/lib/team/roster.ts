// Who the main team is.
//
// One question, one answer, one place. Before migration 026 it had four
// implicit answers at once — every /team page selected the whole `players`
// table, `flex-team.ts` inferred it per match from "five non-null player_ids on
// one side", and `track_flex` on an account looked like a membership flag while
// being read only by the sync. None of them could name a player who hadn't
// played, which is most of what a team page needs to say.
//
// `players.team_role` is the answer. Non-null means on the team; the value is
// the position, because a team ordered alphabetically is ordered wrong.
//
// The fold and the predicate are pure and I/O-free; only `loadTeamRoster` does
// a read, and it takes a DataSource so the demo gets the same rule for free.

import { rows } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import { TEAM_ROLES, type TeamRole } from "@/lib/team/types";

/**
 * How many of the team have to be in a Riot game before it counts as the team
 * playing it. Five, and not configurable: "the team" is five people on the
 * map, which is a fact about League and not a preference.
 */
export const FULL_STACK = 5;

/** Top → Jungle → Mid → ADC → Support. `TEAM_ROLES` is already in that order. */
export const TEAM_ROLE_ORDER: readonly TeamRole[] = TEAM_ROLES;

const ROLE_RANK = new Map<string, number>(TEAM_ROLE_ORDER.map((role, i) => [role, i]));

export type TeamMemberRow = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  team_role: string | null;
};

export type TeamMember = Omit<TeamMemberRow, "team_role"> & { team_role: TeamRole };

export function isTeamMember<T extends { team_role: string | null }>(
  player: T,
): boolean {
  return player.team_role !== null && ROLE_RANK.has(player.team_role);
}

/**
 * Role order, then name.
 *
 * The name tie-break is what makes it a *total* order, which matters the moment
 * there is a substitute: two people at mid would otherwise swap places between
 * renders for no reason a reader could see.
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

export const TEAM_MEMBER_COLUMNS = "id, slug, display_name, avatar_url, team_role";

/**
 * The main team, in role order.
 *
 * Filtered in SQL rather than fetched-then-filtered so the demo can't leak the
 * wider roster through a page that forgot to narrow, and so the partial index
 * from 026 is the thing answering the question.
 */
export async function loadTeamRoster(source: DataSource): Promise<TeamMember[]> {
  const result = rows(
    await source.supabase
      .from(source.table("players"))
      .select(TEAM_MEMBER_COLUMNS)
      .not("team_role", "is", null)
      .returns<TeamMemberRow[]>(),
    "team roster",
  );

  // The `not is null` above is the real filter; isTeamMember re-checks the
  // *value*, so a role that stopped being one of the five (a bad hand-written
  // update, a future rename) drops the row instead of sorting it to the end
  // where it would read as a team member with no position.
  return sortTeamMembers(result.filter(isTeamMember)) as TeamMember[];
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
 * also the one with a consequence: a game played before a substitute joined the
 * roster is judged by today's roster, and one played before a member was added
 * was judged by the roster of the day it was synced. See the sync for what that
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
