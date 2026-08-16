// How the player's own line compares to the person standing across from it.
//
// The app already knows who that person is — findLaneOpponent in lib/roles.ts,
// which lib/matchups.ts uses to build the per-champion matchup list. That one
// answers "which champions beat me". This one answers the flatter question a
// coach asks first: across every game, do they come out of lane ahead or behind,
// and by how much.
//
// Absolute totals would be misleading, because a 40-minute game produces bigger
// gaps than a 20-minute one for reasons that have nothing to do with the player.
// So every figure is normalized per minute, over the duration of the games where
// an opponent was actually found.
//
// Note where this differs from player-stats.ts: that module drops support games
// from CS/min, because it averages one player's CS across every role and support
// farm would drag it down. Here the comparison is like-for-like — a support's
// lane opponent is the enemy support — so support CS diff is a real number and
// is kept.

import { findLaneOpponent } from "@/lib/roles";

export type LaneDiffInput = {
  match_id: string;
  player_id: string | null;
  team_id: number;
  team_position: string | null;
  gold_earned: number;
  total_cs: number;
  damage_dealt_to_champions: number;
};

export type LaneDiffAgg = {
  /** Games where a same-role enemy existed. Riot leaves team_position empty on some autofills. */
  games: number;
  wins: number;
  durationSeconds: number;
  goldDiff: number;
  csDiff: number;
  damageDiff: number;
};

/**
 * Not enough below this and the average is one bad game. Same threshold as
 * MIN_MATCHUP_GAMES, which is measuring the same population.
 */
export const MIN_LANE_DIFF_GAMES = 5;

/**
 * Durations arrive as a separate map rather than on the row.
 *
 * The query that returns all ten participants of every match doesn't embed the
 * match — ten rows each carrying a copy of the same duration is ten times the
 * payload for one number. The caller already holds the durations from its own
 * per-player query, so it passes them in.
 */
export function laneDiffForPlayer(
  rows: LaneDiffInput[],
  playerId: string,
  durationSecondsByMatch: Map<string, number>,
): LaneDiffAgg {
  const byMatch = new Map<string, LaneDiffInput[]>();
  for (const row of rows) {
    const list = byMatch.get(row.match_id) ?? [];
    list.push(row);
    byMatch.set(row.match_id, list);
  }

  const agg: LaneDiffAgg = {
    games: 0,
    wins: 0,
    durationSeconds: 0,
    goldDiff: 0,
    csDiff: 0,
    damageDiff: 0,
  };

  for (const [matchId, participants] of byMatch) {
    const viewer = participants.find((p) => p.player_id === playerId);
    if (!viewer) continue;

    const opponent = findLaneOpponent(participants, viewer);
    if (!opponent) continue;

    // A game whose duration didn't come through contributes its diffs to
    // nothing, because every rate below divides by the accumulated clock. Skip
    // it outright rather than adding a numerator with no denominator.
    const duration = durationSecondsByMatch.get(matchId);
    if (!duration) continue;

    agg.games += 1;
    agg.durationSeconds += duration;
    agg.goldDiff += viewer.gold_earned - opponent.gold_earned;
    agg.csDiff += viewer.total_cs - opponent.total_cs;
    agg.damageDiff += viewer.damage_dealt_to_champions - opponent.damage_dealt_to_champions;
  }

  return agg;
}

function perMinute(total: number, durationSeconds: number): number {
  return durationSeconds <= 0 ? 0 : total / (durationSeconds / 60);
}

export function goldDiffPerMinute(agg: LaneDiffAgg): number {
  return perMinute(agg.goldDiff, agg.durationSeconds);
}

export function csDiffPerMinute(agg: LaneDiffAgg): number {
  return perMinute(agg.csDiff, agg.durationSeconds);
}

export function damageDiffPerMinute(agg: LaneDiffAgg): number {
  return perMinute(agg.damageDiff, agg.durationSeconds);
}
