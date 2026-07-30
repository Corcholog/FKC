// Win/loss streaks per player.
//
// Same shape as player-stats.ts and champion-stats.ts: plain rows in, plain
// aggregates out, no I/O — so a page can fetch once and derive several things
// from the same array.

export type StreakInput = {
  player_id: string | null;
  win: boolean;
  game_creation: string;
};

export type Streak = {
  /** Positive for a win streak, negative for a loss streak, 0 with no games. */
  current: number;
  longestWin: number;
  longestLoss: number;
  games: number;
};

const emptyStreak = (): Streak => ({ current: 0, longestWin: 0, longestLoss: 0, games: 0 });

export function streaksByPlayer(rows: StreakInput[]): Map<string, Streak> {
  const byPlayer = new Map<string, StreakInput[]>();
  for (const row of rows) {
    if (!row.player_id) continue;
    const list = byPlayer.get(row.player_id) ?? [];
    list.push(row);
    byPlayer.set(row.player_id, list);
  }

  const result = new Map<string, Streak>();
  for (const [playerId, playerRows] of byPlayer) {
    result.set(playerId, computeStreak(playerRows));
  }
  return result;
}

// Callers can't be trusted to have sorted their rows — a streak read off
// insertion order is silently wrong rather than obviously wrong.
export function computeStreak(rows: StreakInput[]): Streak {
  const ordered = [...rows].sort(
    (a, b) => new Date(a.game_creation).getTime() - new Date(b.game_creation).getTime(),
  );

  const streak = emptyStreak();
  streak.games = ordered.length;

  let run = 0;
  for (const row of ordered) {
    // A run keeps its sign and grows; a flip restarts it at ±1.
    run = row.win ? Math.max(run, 0) + 1 : Math.min(run, 0) - 1;
    streak.longestWin = Math.max(streak.longestWin, run);
    streak.longestLoss = Math.max(streak.longestLoss, -run);
  }

  streak.current = run;
  return streak;
}

// Only shout about a streak once it's actually notable — at 2 games it's noise.
export const NOTABLE_STREAK = 3;

export function formatStreak(streak: Streak): string | null {
  if (streak.current >= NOTABLE_STREAK) return `${streak.current}W streak`;
  if (-streak.current >= NOTABLE_STREAK) return `${-streak.current}L streak`;
  return null;
}
