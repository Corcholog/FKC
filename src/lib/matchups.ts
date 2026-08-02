import { findLaneOpponent } from "@/lib/roles";
// Matchups are per-champion aggregates for one player, same as the tierlist —
// so they order the same way. See the comment on those comparators.
import { byGamesThenRecord } from "@/lib/champion-stats";

// Lane matchups, built entirely out of rows the sync already stores.
//
// Nine of the ten participants in every match are untracked opponents and
// teammates that nothing else in the app aggregates. The enemy in the same lane
// is the one that says something about the tracked player's game, so that's the
// one this file follows.

export type MatchupInput = {
  match_id: string;
  player_id: string | null;
  team_id: number;
  team_position: string | null;
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
};

export type MatchupAgg = {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
};

// Keyed by the enemy champion faced, for one player.
export function matchupsForPlayer(rows: MatchupInput[], playerId: string): MatchupAgg[] {
  const byMatch = new Map<string, MatchupInput[]>();
  for (const row of rows) {
    const list = byMatch.get(row.match_id) ?? [];
    list.push(row);
    byMatch.set(row.match_id, list);
  }

  const byChampion = new Map<number, MatchupAgg>();

  for (const participants of byMatch.values()) {
    const viewer = participants.find((p) => p.player_id === playerId);
    if (!viewer) continue;

    const opponent = findLaneOpponent(participants, viewer);
    if (!opponent) continue;

    const agg = byChampion.get(opponent.champion_id) ?? {
      championId: opponent.champion_id,
      championName: opponent.champion_name,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
    };
    agg.games += 1;
    if (viewer.win) agg.wins += 1;
    // The tracked player's own line in that matchup, not the opponent's.
    agg.kills += viewer.kills;
    agg.deaths += viewer.deaths;
    agg.assists += viewer.assists;
    byChampion.set(opponent.champion_id, agg);
  }

  return [...byChampion.values()].sort(byGamesThenRecord);
}

export function matchupWinRate(agg: MatchupAgg): number {
  return agg.games === 0 ? 0 : Math.round((agg.wins / agg.games) * 100);
}

// Enough games that a losing record means something rather than being two
// coinflips in a row.
export const MIN_MATCHUP_GAMES = 3;

// The champion that beats this player most often — most losses first, with
// winrate breaking ties so a 1-4 loses out to a 0-4 rather than the other way
// round. Null when nobody has been faced often enough to name.
export function nemesis(matchups: MatchupAgg[], minGames = MIN_MATCHUP_GAMES): MatchupAgg | null {
  const qualified = matchups.filter((m) => m.games >= minGames && m.wins * 2 < m.games);
  if (qualified.length === 0) return null;

  return qualified.reduce((worst, m) => {
    const losses = m.games - m.wins;
    const worstLosses = worst.games - worst.wins;
    if (losses !== worstLosses) return losses > worstLosses ? m : worst;
    return matchupWinRate(m) < matchupWinRate(worst) ? m : worst;
  });
}
