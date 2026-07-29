import { isSupport } from "@/lib/roles";

export type PlayerStatInput = {
  player_id: string | null;
  team_position: string | null;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
  damage_dealt_to_champions: number;
  game_duration_seconds: number;
};

export type PlayerAgg = {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  totalDamage: number;
  totalDurationSeconds: number;
  // CS accumulates over non-support games only, with its own game count and
  // duration: support CS/min is structurally low, so folding those games in
  // would drag down the CS/min of anyone who fills support some of the time.
  csGames: number;
  totalCs: number;
  csDurationSeconds: number;
};

function emptyAgg(): PlayerAgg {
  return {
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    totalDamage: 0,
    totalDurationSeconds: 0,
    csGames: 0,
    totalCs: 0,
    csDurationSeconds: 0,
  };
}

// Rolls every tracked player's participant rows into one lifetime aggregate —
// used for the dashboard's award tiles.
export function aggregatePlayerStats(rows: PlayerStatInput[]): Map<string, PlayerAgg> {
  const byPlayer = new Map<string, PlayerAgg>();

  for (const row of rows) {
    if (!row.player_id) continue;
    const agg = byPlayer.get(row.player_id) ?? emptyAgg();

    agg.games += 1;
    if (row.win) agg.wins += 1;
    agg.kills += row.kills;
    agg.deaths += row.deaths;
    agg.assists += row.assists;
    agg.totalDamage += row.damage_dealt_to_champions;
    agg.totalDurationSeconds += row.game_duration_seconds;

    if (!isSupport(row.team_position)) {
      agg.csGames += 1;
      agg.totalCs += row.total_cs;
      agg.csDurationSeconds += row.game_duration_seconds;
    }

    byPlayer.set(row.player_id, agg);
  }

  return byPlayer;
}

// A deathless aggregate is only reachable at very low game counts, but it would
// divide by zero — treat it as if there were a single death, the same
// convention op.gg and friends use.
export function kdaRatio(agg: PlayerAgg): number {
  return (agg.kills + agg.assists) / Math.max(agg.deaths, 1);
}

export function deathsPerGame(agg: PlayerAgg): number {
  return agg.games === 0 ? 0 : agg.deaths / agg.games;
}

export function playerWinRate(agg: PlayerAgg): number {
  return agg.games === 0 ? 0 : Math.round((agg.wins / agg.games) * 100);
}

export function csPerMinute(agg: PlayerAgg): number {
  return agg.csDurationSeconds <= 0 ? 0 : agg.totalCs / (agg.csDurationSeconds / 60);
}

export function damagePerMinute(agg: PlayerAgg): number {
  return agg.totalDurationSeconds <= 0 ? 0 : agg.totalDamage / (agg.totalDurationSeconds / 60);
}

export type Award<P> = { player: P; value: number; games: number } | null;

// Picks the roster's leader (or trailer) on one metric. Players with no
// qualifying games are skipped rather than scoring 0 — otherwise a support main
// with no farming games would win every "worst CS/min" award by default, and a
// freshly added player with no games at all would win every "worst" award.
// Returns null when nobody qualifies, which renders as an em dash.
export function pickAward<P>(
  players: P[],
  aggregates: Map<string, PlayerAgg>,
  playerId: (player: P) => string,
  score: (agg: PlayerAgg) => number,
  gamesFor: (agg: PlayerAgg) => number,
  direction: "max" | "min",
): Award<P> {
  let best: Award<P> = null;

  for (const player of players) {
    const agg = aggregates.get(playerId(player));
    if (!agg) continue;

    const games = gamesFor(agg);
    if (games === 0) continue;

    const value = score(agg);
    if (best === null || (direction === "max" ? value > best.value : value < best.value)) {
      best = { player, value, games };
    }
  }

  return best;
}
