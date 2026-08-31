// When a flex game counts as "the team played", and when it doesn't.
//
// A team match is unambiguous: there is one opponent and `win` is ours. Flex is
// not. The roster queues flex as a five most of the time, but it also queues as
// a three with two friends, and occasionally against each other — and those are
// three different claims:
//
//   * five tracked players on one side is the team playing, and belongs beside
//     scrims and officials in the team record
//   * fewer than five is some of the roster playing flex, which is a real
//     statistic about those players and a false one about the team
//   * tracked players on both sides is a civil war, which has no team result at
//     all: whatever number you write down, the team both won and lost it
//
// So this splits them and reports the counts rather than picking one and hoping.
// The alternative — treating every flex game with any tracked player as a team
// game — inflates the record with games the team did not play, and inverts on
// the civil wars.
//
// Pure: no I/O, no React, no Supabase.

import { FULL_STACK } from "@/lib/team/roster";

// One definition, re-exported: the threshold is a fact about the roster, so it
// lives with the roster (lib/team/roster.ts). Kept exported here so the callers
// that already import it from this module keep working.
export { FULL_STACK };

export type FlexParticipantInput = {
  match_id: string;
  player_id: string | null;
  team_id: number;
  win: boolean;
  game_creation: string;
  game_duration_seconds: number;
};

export type FlexGame = {
  matchId: string;
  gameCreation: string;
  durationSeconds: number;
  /** The tracked players who were in it, on the side the group was on. */
  playerIds: string[];
  /** That side's result. Meaningless when `civilWar`, and undefined is not an option. */
  win: boolean;
  /** Tracked players on both teams — no single result belongs to the roster. */
  civilWar: boolean;
};

export type FlexSplit = {
  /** Games the full roster played together, in play order (newest first). */
  fullStack: FlexGame[];
  /** Games with some of the roster on one side. */
  partial: FlexGame[];
  /** Games the roster played against itself. */
  civilWars: FlexGame[];
};

/**
 * Groups flex participant rows into games, and splits them three ways.
 *
 * Takes every participant row of the matches concerned, tracked or not — the
 * untracked nine are what make "were they all on one side" answerable at all.
 */
export function splitFlexGames(rows: FlexParticipantInput[]): FlexSplit {
  const byMatch = new Map<string, FlexParticipantInput[]>();
  for (const row of rows) {
    const list = byMatch.get(row.match_id);
    if (list) list.push(row);
    else byMatch.set(row.match_id, [row]);
  }

  const games: FlexGame[] = [];

  for (const [matchId, participants] of byMatch) {
    const tracked = participants.filter((p) => p.player_id);
    if (tracked.length === 0) continue;

    const sides = new Set(tracked.map((p) => p.team_id));
    const first = tracked[0];
    const civilWar = sides.size > 1;

    // On a civil war the "side" is arbitrary, so the group is every tracked
    // player and the result is the first one's — recorded so the game can be
    // counted and named, never so it can be added to a record.
    const group = civilWar ? tracked : tracked.filter((p) => p.team_id === first.team_id);

    games.push({
      matchId,
      gameCreation: first.game_creation,
      durationSeconds: first.game_duration_seconds,
      playerIds: group.map((p) => p.player_id as string),
      win: first.win,
      civilWar,
    });
  }

  games.sort((a, b) => b.gameCreation.localeCompare(a.gameCreation));

  return {
    fullStack: games.filter((g) => !g.civilWar && g.playerIds.length >= FULL_STACK),
    partial: games.filter((g) => !g.civilWar && g.playerIds.length < FULL_STACK),
    civilWars: games.filter((g) => g.civilWar),
  };
}

export type FlexRecord = { games: number; wins: number; losses: number; winRate: number };

export function flexRecord(games: FlexGame[]): FlexRecord {
  const wins = games.filter((g) => g.win).length;
  return {
    games: games.length,
    wins,
    losses: games.length - wins,
    // Rounded like every other win rate in the app (player-stats.ts), so the
    // two never differ by a decimal on the same page.
    winRate: games.length === 0 ? 0 : Math.round((wins / games.length) * 100),
  };
}

/**
 * How often each player was in a full-stack game.
 *
 * Answers "who actually plays flex with the team" — a five-stack needs five
 * people and the fifth is not always the same one, so a roster of nine can have
 * a clear first choice and two who fill in.
 */
export function fullStackAppearances(games: FlexGame[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const game of games) {
    for (const id of game.playerIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}
