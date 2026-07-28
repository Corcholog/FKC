export type ChampionStatInput = {
  player_id: string | null;
  champion_id: number;
  champion_name: string;
  win: boolean;
  total_cs: number;
  damage_dealt_to_champions: number;
  game_duration_seconds: number;
};

export type ChampionAgg = {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  totalCs: number;
  totalDamage: number;
  totalDurationSeconds: number;
};

// Groups by (player, champion) and returns each player's top N champions by
// games played — used for the home page's "top champions" strip.
export function topChampionsByPlayer(rows: ChampionStatInput[], limit = 5): Map<string, ChampionAgg[]> {
  const byPlayer = new Map<string, Map<number, ChampionAgg>>();

  for (const row of rows) {
    if (!row.player_id) continue;
    const champMap = byPlayer.get(row.player_id) ?? new Map<number, ChampionAgg>();
    const agg = champMap.get(row.champion_id) ?? {
      championId: row.champion_id,
      championName: row.champion_name,
      games: 0,
      wins: 0,
      totalCs: 0,
      totalDamage: 0,
      totalDurationSeconds: 0,
    };
    agg.games += 1;
    if (row.win) agg.wins += 1;
    agg.totalCs += row.total_cs;
    agg.totalDamage += row.damage_dealt_to_champions;
    agg.totalDurationSeconds += row.game_duration_seconds;
    champMap.set(row.champion_id, agg);
    byPlayer.set(row.player_id, champMap);
  }

  const result = new Map<string, ChampionAgg[]>();
  for (const [playerId, champMap] of byPlayer) {
    const top = [...champMap.values()]
      .sort((a, b) => b.games - a.games)
      .slice(0, limit);
    result.set(playerId, top);
  }
  return result;
}

export function championWinRate(agg: ChampionAgg): number {
  return agg.games === 0 ? 0 : Math.round((agg.wins / agg.games) * 100);
}
