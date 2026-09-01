import { isSupport, mainRole } from "@/lib/roles";

export type PlayerStatInput = {
  player_id: string | null;
  team_position: string | null;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
  /**
   * Null when the source doesn't record it — a team match, which is typed in
   * from a scoreboard that has no damage column. Never null on a Riot row.
   *
   * Null rather than 0, and the distinction is the whole point: 0 is a real
   * damage figure and would drag an average down, where null means the game
   * simply doesn't answer the question.
   */
  damage_dealt_to_champions: number | null;
  game_duration_seconds: number;

  // Added by migration 005. Null on every row synced before it, and on any
  // field Riot stopped returning — see src/lib/participant-row.ts. Each has its
  // own game counter below so an average is taken over the games that actually
  // reported it, rather than being diluted by the ones that didn't.
  vision_score?: number | null;
  total_time_spent_dead?: number | null;
  penta_kills?: number | null;
  objectives_stolen?: number | null;
  total_damage_taken?: number | null;
  pings?: Record<string, number> | null;
  first_blood_kill?: boolean | null;

  /**
   * The 0-100 performance score (migration 030), with a clock of its own like
   * every other nullable metric here.
   *
   * Two distinct reasons for a null, and neither should count as a zero: the
   * game predates migration 005 and cannot be scored, or it can be and no
   * recompute has run yet. A team match is a third — lib/score.ts needs damage,
   * gold and vision, and a hand-entered scrim records none of them.
   */
  performance_score?: number | null;
};

export type PlayerAgg = {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  // Damage has its own clock for the same reason CS does, one step further on:
  // CS excludes support games, damage excludes whole *sources*. A team match
  // records no damage at all, so counting its minutes in the denominator would
  // divide a real numerator by a duration that never contributed to it — DPM
  // quietly halved on any mixed aggregate, with the number still rendering.
  damageGames: number;
  totalDamage: number;
  damageDurationSeconds: number;
  totalDurationSeconds: number;
  // CS accumulates over non-support games only, with its own game count and
  // duration: support CS/min is structurally low, so folding those games in
  // would drag down the CS/min of anyone who fills support some of the time.
  csGames: number;
  totalCs: number;
  csDurationSeconds: number;

  // Migration-005 metrics. detailGames counts rows that carried the new columns
  // at all, so a half-backfilled database reports "best vision score, 4 games"
  // rather than quietly averaging over nulls. detailDurationSeconds is the
  // matching clock: a per-minute rate over these metrics has to divide by the
  // duration of the games that reported them, not of every game ever played.
  detailGames: number;
  detailDurationSeconds: number;
  // Its own counter rather than reusing detailGames: a row can carry the
  // migration-005 columns and still have no score, in the window between
  // running the backfill and pressing "Recompute scores".
  scoredGames: number;
  totalScore: number;
  totalVisionScore: number;
  totalTimeSpentDead: number;
  pentaKills: number;
  objectivesStolen: number;
  totalDamageTaken: number;
  missingPings: number;
  totalPings: number;
  firstBloods: number;
};

function emptyAgg(): PlayerAgg {
  return {
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    damageGames: 0,
    totalDamage: 0,
    damageDurationSeconds: 0,
    totalDurationSeconds: 0,
    csGames: 0,
    totalCs: 0,
    csDurationSeconds: 0,
    detailGames: 0,
    detailDurationSeconds: 0,
    scoredGames: 0,
    totalScore: 0,
    totalVisionScore: 0,
    totalTimeSpentDead: 0,
    pentaKills: 0,
    objectivesStolen: 0,
    totalDamageTaken: 0,
    missingPings: 0,
    totalPings: 0,
    firstBloods: 0,
  };
}

// Folds one participant row into a running aggregate. Shared by the per-player
// and per-role groupings so the two can't drift.
function accumulate(agg: PlayerAgg, row: PlayerStatInput) {
  agg.games += 1;
  if (row.win) agg.wins += 1;
  agg.kills += row.kills;
  agg.deaths += row.deaths;
  agg.assists += row.assists;
  if (typeof row.damage_dealt_to_champions === "number") {
    agg.damageGames += 1;
    agg.totalDamage += row.damage_dealt_to_champions;
    agg.damageDurationSeconds += row.game_duration_seconds;
  }
  agg.totalDurationSeconds += row.game_duration_seconds;

  if (!isSupport(row.team_position)) {
    agg.csGames += 1;
    agg.totalCs += row.total_cs;
    agg.csDurationSeconds += row.game_duration_seconds;
  }

  if (typeof row.performance_score === "number") {
    agg.scoredGames += 1;
    agg.totalScore += row.performance_score;
  }

  // vision_score is the marker for "this row was synced with full detail" — it
  // is present on every real game once migration 005 has been backfilled.
  if (typeof row.vision_score === "number") {
    agg.detailGames += 1;
    agg.detailDurationSeconds += row.game_duration_seconds;
    agg.totalVisionScore += row.vision_score;
    agg.totalTimeSpentDead += row.total_time_spent_dead ?? 0;
    agg.pentaKills += row.penta_kills ?? 0;
    agg.objectivesStolen += row.objectives_stolen ?? 0;
    agg.totalDamageTaken += row.total_damage_taken ?? 0;
    if (row.first_blood_kill) agg.firstBloods += 1;

    if (row.pings) {
      agg.missingPings += row.pings.enemyMissingPings ?? 0;
      agg.totalPings += Object.values(row.pings).reduce((sum, n) => sum + n, 0);
    }
  }
}

// Rolls every tracked player's participant rows into one lifetime aggregate,
// over whatever rows it's handed. The dashboard's award tiles go through
// aggregateMainRoleStats below rather than calling this directly.
export function aggregatePlayerStats(rows: PlayerStatInput[]): Map<string, PlayerAgg> {
  const byPlayer = new Map<string, PlayerAgg>();

  for (const row of rows) {
    if (!row.player_id) continue;
    const agg = byPlayer.get(row.player_id) ?? emptyAgg();
    accumulate(agg, row);
    byPlayer.set(row.player_id, agg);
  }

  return byPlayer;
}

/**
 * Each player's main role, by game count — see mainRole in src/lib/roles.ts.
 * Players whose rows carry no role at all (Riot leaves team_position empty on
 * remakes and some autofills) map to null.
 */
export function mainRoleByPlayer(rows: PlayerStatInput[]): Map<string, string | null> {
  const positionsByPlayer = new Map<string, (string | null)[]>();

  for (const row of rows) {
    if (!row.player_id) continue;
    const positions = positionsByPlayer.get(row.player_id) ?? [];
    positions.push(row.team_position);
    positionsByPlayer.set(row.player_id, positions);
  }

  return new Map([...positionsByPlayer].map(([playerId, positions]) => [playerId, mainRole(positions)]));
}

/**
 * Lifetime aggregate over each player's main role only — what the dashboard's
 * award tiles rank on.
 *
 * Off-role games are noise for these awards: a mid laner filling support for
 * three games takes a vision score and a CS/min from a role they don't play,
 * and both numbers then compete against people who play that role every game.
 * Dropping them means every tile compares like with like, at the cost of a
 * lower game count on anyone who fills a lot — which the tile's sub-text shows.
 *
 * A player with no determinable role keeps their whole history rather than
 * vanishing from every award.
 */
export function aggregateMainRoleStats(rows: PlayerStatInput[]): Map<string, PlayerAgg> {
  const roles = mainRoleByPlayer(rows);
  return aggregatePlayerStats(
    rows.filter((row) => {
      const role = row.player_id ? roles.get(row.player_id) : null;
      return !role || row.team_position === role;
    }),
  );
}

// The same aggregate, split by the role played — keyed by Riot's raw
// team_position (see src/lib/roles.ts), with null folded under "" for games
// where Riot couldn't determine a role.
export function aggregateByRole(rows: PlayerStatInput[]): Map<string, PlayerAgg> {
  const byRole = new Map<string, PlayerAgg>();

  for (const row of rows) {
    const key = row.team_position ?? "";
    const agg = byRole.get(key) ?? emptyAgg();
    accumulate(agg, row);
    byRole.set(key, agg);
  }

  return byRole;
}

export type Trend = {
  recent: PlayerAgg;
  lifetime: PlayerAgg;
  /** Null until there are enough recent games for the comparison to mean anything. */
  delta: ((metric: (agg: PlayerAgg) => number) => number) | null;
};

export const TREND_WINDOW = 10;

// Recent form against the lifetime baseline. Rows must be newest-first — the
// callers all read them straight off a `game_creation desc` query.
export function computeTrend(rowsNewestFirst: PlayerStatInput[], window = TREND_WINDOW): Trend {
  const lifetime = emptyAgg();
  for (const row of rowsNewestFirst) accumulate(lifetime, row);

  const recent = emptyAgg();
  for (const row of rowsNewestFirst.slice(0, window)) accumulate(recent, row);

  // Comparing the last 10 against a lifetime that *is* those same 10 games
  // would always show a delta of zero, so it needs a genuinely longer history.
  const comparable = recent.games >= window && lifetime.games > window;

  return {
    recent,
    lifetime,
    delta: comparable ? (metric) => metric(recent) - metric(lifetime) : null,
  };
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
  return agg.damageDurationSeconds <= 0
    ? 0
    : agg.totalDamage / (agg.damageDurationSeconds / 60);
}

// ------------------------------------------------------------
// Metrics from migration 005. Each averages over detailGames rather than games,
// so a partially backfilled history reports an honest average of what it has.
// ------------------------------------------------------------

// Vision score is accrued over time — wards placed, wards killed, and how long
// each one lived — so a per-game total mostly measures how long the games ran.
// Rate per minute is what actually separates someone who wards well from
// someone who plays 40-minute games.
/**
 * Mean performance score over the games that have one.
 *
 * Averaged over scoredGames, not games: a player whose history is half
 * pre-backfill would otherwise be averaged against zeroes and come out looking
 * like the worst player on the roster by a distance. Returns 0 when nothing is
 * scored, which the award layer reads as "no answer" and drops.
 */
export function averagePerformanceScore(agg: PlayerAgg): number {
  return agg.scoredGames === 0 ? 0 : agg.totalScore / agg.scoredGames;
}

export function visionScorePerMinute(agg: PlayerAgg): number {
  return agg.detailDurationSeconds <= 0
    ? 0
    : agg.totalVisionScore / (agg.detailDurationSeconds / 60);
}

export function damageTakenPerMinute(agg: PlayerAgg): number {
  return agg.totalDurationSeconds <= 0 ? 0 : agg.totalDamageTaken / (agg.totalDurationSeconds / 60);
}

// Total minutes spent staring at the grey screen. A raw total, not an average —
// the number only lands as a number.
export function minutesSpentDead(agg: PlayerAgg): number {
  return agg.totalTimeSpentDead / 60;
}

// Share of the game spent dead. The fair version of the stat above, since
// someone who simply plays more will always top the raw total.
export function deadTimeShare(agg: PlayerAgg): number {
  return agg.totalDurationSeconds <= 0 ? 0 : (agg.totalTimeSpentDead / agg.totalDurationSeconds) * 100;
}

export function missingPingsPerGame(agg: PlayerAgg): number {
  return agg.detailGames === 0 ? 0 : agg.missingPings / agg.detailGames;
}

export function pingsPerGame(agg: PlayerAgg): number {
  return agg.detailGames === 0 ? 0 : agg.totalPings / agg.detailGames;
}

export type Ranked<P> = { player: P; value: number; games: number };

// The whole roster on one metric, best-first — the award winner is just entry
// zero. Players with no qualifying games are dropped rather than scoring 0:
// otherwise a support main with no farming games would win every "worst CS/min"
// award by default, and a freshly added player with no games at all would win
// every "worst" award. An empty result renders as an em dash.
//
// The full order matters as much as the winner, because "why didn't I get that
// award?" is only answerable next to everyone else's number — see StatRankingDialog.
export function rankPlayers<P>(
  players: P[],
  aggregates: Map<string, PlayerAgg>,
  playerId: (player: P) => string,
  score: (agg: PlayerAgg) => number,
  gamesFor: (agg: PlayerAgg) => number,
  direction: "max" | "min",
): Ranked<P>[] {
  const ranked: Ranked<P>[] = [];

  for (const player of players) {
    const agg = aggregates.get(playerId(player));
    if (!agg) continue;

    const games = gamesFor(agg);
    if (games === 0) continue;

    ranked.push({ player, value: score(agg), games });
  }

  // Sort is stable, so players tied on the metric stay in roster order and the
  // winner doesn't shuffle between renders.
  return ranked.sort((a, b) => (direction === "max" ? b.value - a.value : a.value - b.value));
}
