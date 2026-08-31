// The team's win rate over time, as one line per source.
//
// Cumulative rather than rolling, and that is the sample size talking. A team
// plays tens of games in a split, not hundreds; a 10-game rolling window over
// forty games is mostly noise, and the reader would be looking at variance and
// calling it form. Cumulative answers the question the panel is actually for —
// "where has this settled" — and the shape still shows a run: a climb means the
// recent games beat the average, a dip means they didn't.
//
// The first few points are the price. Game one is 0% or 100% and neither means
// anything, so every point carries its own game count and the chart draws the
// unreliable ones differently rather than hiding them — the same call
// duration-stats.ts makes for the same reason.
//
// Pure: no I/O, no React, no Recharts.

/** Anything that happened at a time and was won or lost. */
export type ResultPoint = { playedAt: string; win: boolean };

export type WinratePoint = {
  /** Epoch ms — Recharts needs a number for a time-scaled axis. */
  t: number;
  /** Cumulative win rate up to and including this game, 0-100, rounded. */
  winRate: number;
  games: number;
  wins: number;
  /** Above the sample floor. Below it the point is shape, not a number to quote. */
  reliable: boolean;
};

/**
 * Below this a cumulative point is arithmetic rather than information.
 *
 * Five, not the hundred `side-stats.ts` demands, because these are not games
 * where the variable is assigned at random — they are games the team chose to
 * play. The floor is here to stop the first two points reading as a collapse or
 * a hot streak, not to gate a claim about a coin flip.
 */
export const MIN_WINRATE_SAMPLE = 5;

/**
 * One point per game, in play order, each carrying the record so far.
 *
 * Sorts its own input. Callers merge two sources whose timestamps come from
 * different places — a Riot match has a real clock, a team match only has the
 * day it was played — and neither arrives sorted against the other.
 */
export function cumulativeWinRate(results: ResultPoint[]): WinratePoint[] {
  const ordered = [...results].sort((a, b) => a.playedAt.localeCompare(b.playedAt));

  let wins = 0;
  return ordered.map((result, i) => {
    if (result.win) wins += 1;
    const games = i + 1;
    return {
      t: Date.parse(result.playedAt),
      // Rounded like every other win rate in the app, so the last point of this
      // line and the record printed beside it never differ by a decimal.
      winRate: Math.round((wins / games) * 100),
      games,
      wins,
      reliable: games >= MIN_WINRATE_SAMPLE,
    };
  });
}
