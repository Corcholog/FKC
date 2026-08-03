import {
  aggregateByRole,
  computeTrend,
  kdaRatio,
  deathsPerGame,
  playerWinRate,
  type PlayerAgg,
} from "@/lib/player-stats";
import { allChampionsByPlayer, type ChampionAgg } from "@/lib/champion-stats";
import { matchupsForPlayer, nemesis, type MatchupAgg, type MatchupInput } from "@/lib/matchups";
import { groupIntoSessions, winRateByGameIndex, type GameIndexPoint } from "@/lib/sessions";
import { computeStreak, type Streak } from "@/lib/streaks";

// Everything the AI summary knows about a player that isn't a single game.
//
// Same shape as the rest of lib/: plain rows in, plain aggregates out, no I/O —
// so summary.ts can fetch once and derive all of this from the same array.
//
// The reason this file exists is narrower than "stats": the prompt hands the
// model a bounded window of raw games, and a model asked to count across
// hundreds of rows invents winrates with total confidence. Everything the
// summary might want to claim about the *whole* history is computed here, in
// TypeScript, so the model is reading a number rather than deriving one. If a
// claim in a generated summary can't be traced to something on this type, the
// model made it up.
//
// This file computes; it does not format. Turning these into prompt lines is
// summary.ts's job, because that's where the null-omission rules live.

export type SignalRow = {
  match_id: string;
  game_creation: string;
  game_duration_seconds: number;

  player_id: string | null;
  team_id: number;
  team_position: string | null;
  champion_id: number;
  champion_name: string;
  win: boolean;

  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
  gold_earned: number;
  damage_dealt_to_champions: number;

  // Migration-005 columns: null on every row synced before it. See the null
  // rules in player-stats.ts — the aggregates below count their own sample.
  //
  // No total_time_spent_dead. It's stored, and player-stats can aggregate it,
  // but it says nothing here that deaths per game doesn't already say — it is
  // deaths multiplied by the respawn timer, so it rises with game length and
  // with level, not with anything the player did differently. A summary is a
  // budget of things worth reading; this was one of them spent on a restatement.
  vision_score: number | null;
  first_blood_kill: boolean | null;
  first_blood_assist: boolean | null;
};

// Below this a split is one good night, not a pattern. Emitting "42% winrate"
// off two games is exactly the kind of thing the summary is supposed to stop
// doing, and the model will happily build a paragraph on it.
export const MIN_SPLIT_GAMES = 3;

export type RoleSignal = {
  teamPosition: string | null;
  games: number;
  wins: number;
  winRate: number;
  kda: number;
  deathsPerGame: number;
};

export type GameLengthSignal = {
  winGames: number;
  lossGames: number;
  winAvgSeconds: number;
  lossAvgSeconds: number;
};

/** Null when no row in the history reported these columns at all. */
export type FirstBloodSignal = { reportedGames: number; involved: number };
export type KillParticipationSignal = { reportedGames: number; average: number };

export type PlayerSignals = {
  totalGames: number;
  roles: RoleSignal[];
  champions: ChampionAgg[];
  matchups: MatchupAgg[];
  worstMatchup: MatchupAgg | null;
  /** Last TREND_WINDOW games against the full history. `delta` is null until comparable. */
  trend: ReturnType<typeof computeTrend>;
  /** Winrate by how deep into a queue session the game was — the tilt signal. */
  sessionCurve: GameIndexPoint[];
  streak: Streak;
  gameLength: GameLengthSignal;
  firstBlood: FirstBloodSignal | null;
  killParticipation: KillParticipationSignal | null;
};

// Rows must be newest-first: computeTrend reads its window straight off the
// front, the same contract the player page's queries already satisfy.
export function computePlayerSignals(
  rowsNewestFirst: SignalRow[],
  allParticipants: MatchupInput[],
  playerId: string,
): PlayerSignals {
  const roles = [...aggregateByRole(rowsNewestFirst)]
    .map(([teamPosition, agg]) => toRoleSignal(teamPosition || null, agg))
    .filter((r) => r.games >= MIN_SPLIT_GAMES)
    .sort((a, b) => b.games - a.games);

  const champions = (allChampionsByPlayer(rowsNewestFirst).get(playerId) ?? []).filter(
    (c) => c.games >= MIN_SPLIT_GAMES,
  );

  const matchups = matchupsForPlayer(allParticipants, playerId);

  // Sessions want oldest-first internally, and groupIntoSessions sorts for
  // itself — see the comment there. Passing newest-first is safe.
  const sessions = groupIntoSessions(rowsNewestFirst);

  return {
    totalGames: rowsNewestFirst.length,
    roles,
    champions,
    matchups: matchups.filter((m) => m.games >= MIN_SPLIT_GAMES),
    worstMatchup: nemesis(matchups),
    trend: computeTrend(rowsNewestFirst),
    sessionCurve: winRateByGameIndex(sessions),
    streak: computeStreak(rowsNewestFirst),
    gameLength: gameLengthSignal(rowsNewestFirst),
    firstBlood: firstBloodSignal(rowsNewestFirst),
    killParticipation: killParticipationSignal(allParticipants, playerId),
  };
}

function toRoleSignal(teamPosition: string | null, agg: PlayerAgg): RoleSignal {
  return {
    teamPosition,
    games: agg.games,
    wins: agg.wins,
    winRate: playerWinRate(agg),
    kda: kdaRatio(agg),
    deathsPerGame: deathsPerGame(agg),
  };
}

// Whether this player closes games out or gets ground down. A player who wins
// at 26 minutes and loses at 38 is playing a different game from one who wins
// the long ones, and neither shows up in a winrate.
function gameLengthSignal(rows: SignalRow[]): GameLengthSignal {
  let winGames = 0;
  let lossGames = 0;
  let winSeconds = 0;
  let lossSeconds = 0;

  for (const row of rows) {
    if (row.win) {
      winGames += 1;
      winSeconds += row.game_duration_seconds;
    } else {
      lossGames += 1;
      lossSeconds += row.game_duration_seconds;
    }
  }

  return {
    winGames,
    lossGames,
    winAvgSeconds: winGames === 0 ? 0 : winSeconds / winGames,
    lossAvgSeconds: lossGames === 0 ? 0 : lossSeconds / lossGames,
  };
}

// first_blood_kill is nullable twice over: rows synced before migration 005
// never had it, and Riot has shipped patches where a field stops arriving. Rows
// that didn't report it are excluded from the denominator rather than counted
// as "no first blood", which would quietly understate every early-game player.
function firstBloodSignal(rows: SignalRow[]): FirstBloodSignal | null {
  let reportedGames = 0;
  let involved = 0;

  for (const row of rows) {
    if (typeof row.first_blood_kill !== "boolean") continue;
    reportedGames += 1;
    if (row.first_blood_kill || row.first_blood_assist) involved += 1;
  }

  return reportedGames === 0 ? null : { reportedGames, involved };
}

// Kill participation, derived from the team's own rows rather than read out of
// the challenges blob. Riot ships a killParticipation challenge, but it's only
// present on some patches, and having two subtly different KP numbers in one
// prompt — an aggregate from challenges next to per-match ones computed from
// team kills — is worse than having one. This is the same basis
// formatKillParticipation uses in the match lines, so they always agree.
//
// A team with zero kills is skipped rather than scored 0%: the denominator, not
// the player, is what's missing.
function killParticipationSignal(
  allParticipants: MatchupInput[],
  playerId: string,
): KillParticipationSignal | null {
  const byMatch = new Map<string, MatchupInput[]>();
  for (const row of allParticipants) {
    const list = byMatch.get(row.match_id) ?? [];
    list.push(row);
    byMatch.set(row.match_id, list);
  }

  let reportedGames = 0;
  let total = 0;

  for (const participants of byMatch.values()) {
    const viewer = participants.find((p) => p.player_id === playerId);
    if (!viewer) continue;

    const teamKills = participants
      .filter((p) => p.team_id === viewer.team_id)
      .reduce((sum, p) => sum + p.kills, 0);
    if (teamKills <= 0) continue;

    reportedGames += 1;
    total += (viewer.kills + viewer.assists) / teamKills;
  }

  return reportedGames === 0 ? null : { reportedGames, average: total / reportedGames };
}
