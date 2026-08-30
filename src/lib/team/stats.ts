// How the team is doing in the games it plays as a team — scrims, friendlies
// and tournament officials alike: overall, by side, by opponent, per player.
//
// Pure functions over TeamGameView[], same shape as every soloq stat module —
// no I/O, so the pages fetch once and fold many times.

import { byGamesThenRecord, type ChampionStatInput } from "@/lib/champion-stats";
import { nicknameOf, type TeamGameView, type TeamMatchKind, type TeamSide } from "@/lib/team/types";

export type Record_ = { games: number; wins: number };

export type TeamRecord = Record_ & {
  losses: number;
  /** Rounded percentage, 0 when nothing has been played. */
  winRate: number;
};

export function toRecord(games: number, wins: number): TeamRecord {
  return {
    games,
    wins,
    losses: games - wins,
    winRate: games === 0 ? 0 : Math.round((wins / games) * 100),
  };
}

export function overallRecord(games: TeamGameView[]): TeamRecord {
  return toRecord(games.length, games.filter((g) => g.win).length);
}

export function recordBySide(games: TeamGameView[]): Record<TeamSide, TeamRecord> {
  const on = (side: TeamSide) => overallRecord(games.filter((g) => g.side === side));
  return { blue: on("blue"), red: on("red") };
}

export function recordByKind(games: TeamGameView[]): Array<{ kind: TeamMatchKind; record: TeamRecord }> {
  const byKind = new Map<TeamMatchKind, Record_>();
  for (const game of games) {
    const entry = byKind.get(game.series.kind) ?? { games: 0, wins: 0 };
    entry.games += 1;
    if (game.win) entry.wins += 1;
    byKind.set(game.series.kind, entry);
  }
  return [...byKind.entries()]
    .map(([kind, r]) => ({ kind, record: toRecord(r.games, r.wins) }))
    .sort((a, b) => b.record.games - a.record.games);
}

export type OpponentRecord = {
  opponentId: string;
  name: string;
  slug: string;
  record: TeamRecord;
  seriesCount: number;
  /** ISO date of the most recent series against them. */
  lastPlayed: string | null;
};

/** Head-to-head against every opponent, most-played first. */
export function recordByOpponent(games: TeamGameView[]): OpponentRecord[] {
  const byOpponent = new Map<
    string,
    { name: string; slug: string; games: number; wins: number; series: Set<string>; lastPlayed: string | null }
  >();

  for (const game of games) {
    const entry = byOpponent.get(game.opponent.id) ?? {
      name: game.opponent.name,
      slug: game.opponent.slug,
      games: 0,
      wins: 0,
      series: new Set<string>(),
      lastPlayed: null,
    };
    entry.games += 1;
    if (game.win) entry.wins += 1;
    entry.series.add(game.series_id);
    if (!entry.lastPlayed || game.series.played_on > entry.lastPlayed) {
      entry.lastPlayed = game.series.played_on;
    }
    byOpponent.set(game.opponent.id, entry);
  }

  return [...byOpponent.entries()]
    .map(([opponentId, e]) => ({
      opponentId,
      name: e.name,
      slug: e.slug,
      record: toRecord(e.games, e.wins),
      seriesCount: e.series.size,
      lastPlayed: e.lastPlayed,
    }))
    .sort((a, b) => b.record.games - a.record.games || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------
// Per player
// ------------------------------------------------------------

export type TeamPlayerAgg = {
  playerId: string | null;
  /** Roster display name where there is one, otherwise the typed-in name. */
  name: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  totalCs: number;
  /** Only counts games that recorded a duration — see csPerMinute below. */
  timedGames: number;
  timedSeconds: number;
  /** Games played in each role, for showing who got moved around. */
  positions: Map<string, number>;
};

function emptyAgg(playerId: string | null, name: string): TeamPlayerAgg {
  return {
    playerId,
    name,
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    totalCs: 0,
    timedGames: 0,
    timedSeconds: 0,
    positions: new Map(),
  };
}

/**
 * Our side's players, aggregated.
 *
 * Keyed by player_id when the pick resolved to a roster row, and by the typed
 * name otherwise, so a substitute gets their own line instead of being folded
 * into whoever else went unmatched. `displayNames` maps roster ids to the names
 * shown on the rest of the site.
 */
export function aggregateAllyPlayers(
  games: TeamGameView[],
  displayNames: Map<string, string>,
): TeamPlayerAgg[] {
  const byKey = new Map<string, TeamPlayerAgg>();

  for (const game of games) {
    for (const pick of game.picks) {
      if (!pick.ally) continue;

      // A substitute has no roster id, so their name is their identity — and
      // an import writes it as a full Riot ID where a person would have typed
      // just the nickname. Group on the nickname, show what was stored.
      const key = pick.player_id ?? `name:${nicknameOf(pick.player_name ?? "").toLowerCase()}`;
      const name =
        (pick.player_id ? displayNames.get(pick.player_id) : null) ??
        pick.player_name ??
        "Unknown";
      const agg = byKey.get(key) ?? emptyAgg(pick.player_id, name);

      agg.games += 1;
      if (game.win) agg.wins += 1;
      agg.kills += pick.kills;
      agg.deaths += pick.deaths;
      agg.assists += pick.assists;
      agg.totalCs += pick.total_cs;
      agg.positions.set(pick.team_position, (agg.positions.get(pick.team_position) ?? 0) + 1);
      // CS/min has to average over only the games that carried a duration, or
      // one game entered without it silently drags everybody's rate down.
      if (game.duration_seconds && game.duration_seconds > 0) {
        agg.timedGames += 1;
        agg.timedSeconds += game.duration_seconds;
      }

      byKey.set(key, agg);
    }
  }

  return [...byKey.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}

/** Same deathless convention as lib/player-stats.ts — a 0-death aggregate divides by 1. */
export function teamKdaRatio(agg: TeamPlayerAgg): number {
  return (agg.kills + agg.assists) / Math.max(agg.deaths, 1);
}

/** Null rather than 0 when no game recorded a duration — "unknown" isn't "zero". */
export function teamCsPerMinute(agg: TeamPlayerAgg): number | null {
  if (agg.timedGames === 0 || agg.timedSeconds <= 0) return null;
  return agg.totalCs / (agg.timedSeconds / 60);
}

export function teamWinRate(agg: { games: number; wins: number }): number {
  return agg.games === 0 ? 0 : Math.round((agg.wins / agg.games) * 100);
}

/**
 * Scrim picks reshaped into the exact input the soloq champion aggregator
 * already takes, so `topChampionsByPlayer` / `allChampionsByPlayer` /
 * `championWinRate` / `championKdaRatio` work on team matches unchanged.
 *
 * `damage_dealt_to_champions` is 0 because these games don't record damage — nothing
 * here renders a damage column, and the field only exists to satisfy the shape.
 */
export function toChampionStatInput(
  games: TeamGameView[],
  side: "ally" | "enemy",
): ChampionStatInput[] {
  const wantAlly = side === "ally";
  return games.flatMap((game) =>
    game.picks
      .filter((pick) => pick.ally === wantAlly)
      .map((pick) => ({
        // Enemies have no roster id; key them by nickname so an opponent's
        // pool still groups per person rather than collapsing into one bucket.
        // Tag lines are dropped from the key for the same reason they are in
        // deriveOpponentRoster: "Peluca" typed by hand and "Peluca#LAS" written
        // by a replay import are one player, not two.
        player_id: wantAlly
          ? pick.player_id
          : `${game.opponent.id}:${pick.team_position}:${nicknameOf(pick.player_name ?? "").toLowerCase()}`,
        champion_id: pick.champion_id,
        champion_name: pick.champion_name,
        // A pick's result is its team's result, and `win` on the game is ours.
        win: wantAlly ? game.win : !game.win,
        kills: pick.kills,
        deaths: pick.deaths,
        assists: pick.assists,
        total_cs: pick.total_cs,
        damage_dealt_to_champions: 0,
        game_duration_seconds: game.duration_seconds ?? 0,
      })),
  );
}

export { byGamesThenRecord };
