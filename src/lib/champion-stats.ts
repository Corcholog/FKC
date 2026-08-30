export type ChampionStatInput = {
  player_id: string | null;
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
  /** Null when the source doesn't record it — a team match. Never null on Riot. */
  damage_dealt_to_champions: number | null;
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
  /**
   * The duration of the games that reported damage, which is not always every
   * game. dmg/min divides by this, so a pool holding team matches reports the
   * rate its Riot games actually had rather than one diluted by the rest.
   */
  damageDurationSeconds: number;
  totalDurationSeconds: number;
};

// ------------------------------------------------------------
// Display ordering.
//
// Shared by every list that ranks champions for one player — the player page's
// top-champion strip, the /champions tierlist, and the lane matchups in
// lib/matchups.ts — so the three can't drift into disagreeing about what
// "first" means. Anything with games/wins/championId can use them.
//
// Both comparators are *total*: they end on championId, so equal records keep a
// fixed order instead of falling back to whatever order the rows arrived in.
// ------------------------------------------------------------

export type RankableChampionAgg = { championId: number; games: number; wins: number };

/** Most games first; a tie goes to the better record. */
export function byGamesThenRecord(a: RankableChampionAgg, b: RankableChampionAgg): number {
  // With games equal, more wins *is* a higher winrate — and comparing wins is
  // exact, where two different records can round to the same percentage.
  return b.games - a.games || b.wins - a.wins || a.championId - b.championId;
}

/** Best winrate first; a tie goes to whoever played more games. */
export function byWinRateThenGames(a: RankableChampionAgg, b: RankableChampionAgg): number {
  // Cross-multiplied rather than dividing: exact, no float noise, and no
  // divide-by-zero on a zero-game aggregate.
  const byRate = b.wins * a.games - a.wins * b.games;
  // A tie on rate goes to the bigger sample — 7/10 is a stronger 70% than 0.7
  // off three games.
  return byRate || b.games - a.games || a.championId - b.championId;
}

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
      damageDurationSeconds: 0,
      totalDurationSeconds: 0,
    };
    agg.games += 1;
    if (row.win) agg.wins += 1;
    agg.kills += row.kills;
    agg.deaths += row.deaths;
    agg.assists += row.assists;
    agg.totalCs += row.total_cs;
    if (typeof row.damage_dealt_to_champions === "number") {
      agg.totalDamage += row.damage_dealt_to_champions;
      agg.damageDurationSeconds += row.game_duration_seconds;
    }
    agg.totalDurationSeconds += row.game_duration_seconds;
    champMap.set(row.champion_id, agg);
    byPlayer.set(row.player_id, champMap);
  }

  const result = new Map<string, ChampionAgg[]>();
  for (const [playerId, champMap] of byPlayer) {
    const top = [...champMap.values()].sort(byGamesThenRecord).slice(0, limit);
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
