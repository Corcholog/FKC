export type ChampionStatInput = {
  player_id: string | null;
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
  damage_dealt_to_champions: number;
  game_duration_seconds: number;
};

export type ChampionAgg = {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
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
      kills: 0,
      deaths: 0,
      assists: 0,
      totalCs: 0,
      totalDamage: 0,
      totalDurationSeconds: 0,
    };
    agg.games += 1;
    if (row.win) agg.wins += 1;
    agg.kills += row.kills;
    agg.deaths += row.deaths;
    agg.assists += row.assists;
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

// Same grouping as topChampionsByPlayer but returns every champion played,
// sorted by games desc — used for the /champions full tierlist page.
export function allChampionsByPlayer(rows: ChampionStatInput[]): Map<string, ChampionAgg[]> {
  return topChampionsByPlayer(rows, Infinity);
}

export function championWinRate(agg: ChampionAgg): number {
  return agg.games === 0 ? 0 : Math.round((agg.wins / agg.games) * 100);
}

// Same deathless convention as player-stats' kdaRatio: a 0-death aggregate
// divides by 1 instead of blowing up.
export function championKdaRatio(agg: ChampionAgg): number {
  return (agg.kills + agg.assists) / Math.max(agg.deaths, 1);
}
