// Blue side or red side, and whether it matters.
//
// team_id has been on every participant row since the first sync and nothing
// has ever read it for anything but splitting a match into two team strips.
//
// Be honest about what this is worth where it's shown. In soloq the side is
// assigned, so a gap is close to noise unless the sample is large — it's a
// curiosity, and the caption says so. The same two functions carry a real signal
// on the scrims side, where the side comes out of a draft the team prepared for
// and a red-side record is something a coach can actually act on. That is why
// this is its own module rather than four lines inside the player page.

/** Riot's own values: 100 is blue, 200 is red. */
export const BLUE_TEAM_ID = 100;

export type SideStatInput = {
  team_id: number;
  win: boolean;
  game_duration_seconds: number;
};

export type SideAgg = {
  side: "blue" | "red";
  games: number;
  wins: number;
  durationSeconds: number;
};

export type SideSplit = { blue: SideAgg; red: SideAgg };

export function aggregateBySide(rows: SideStatInput[]): SideSplit {
  const split: SideSplit = {
    blue: { side: "blue", games: 0, wins: 0, durationSeconds: 0 },
    red: { side: "red", games: 0, wins: 0, durationSeconds: 0 },
  };

  for (const row of rows) {
    const agg = row.team_id === BLUE_TEAM_ID ? split.blue : split.red;
    agg.games += 1;
    if (row.win) agg.wins += 1;
    agg.durationSeconds += row.game_duration_seconds;
  }

  return split;
}

export function sideWinRate(agg: SideAgg): number {
  return agg.games === 0 ? 0 : Math.round((agg.wins / agg.games) * 100);
}

/** Average game length on this side, in minutes. */
export function sideAverageMinutes(agg: SideAgg): number {
  return agg.games === 0 ? 0 : agg.durationSeconds / agg.games / 60;
}

/**
 * Below this, a gap between the sides is not worth reading as anything.
 *
 * Far higher than the other gates in the codebase (MIN_MATCHUP_GAMES is 3), and
 * it has to be. Those gates ask "did this happen often enough to mention". This
 * one asks whether a difference between two halves of a coinflip is real, and
 * two halves of a small sample drift apart by several points constantly: a real
 * roster history of 56 games came out 52% blue against 48% red, which is four
 * points off nothing at all.
 *
 * The consequence is that the caveat shows for most soloq players most of the
 * time. That is the correct outcome rather than a badly chosen constant — at
 * soloq volumes the honest answer usually is "not enough games to say".
 */
export const MIN_SIDE_GAMES = 100;
