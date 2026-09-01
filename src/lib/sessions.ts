// Queue sessions — consecutive games with no meaningful break between them.
//
// It answered "how did the 7th game of the night go compared to the 1st" for the
// tilt curve on /insights. That page and that curve are gone (ADR-052), along
// with the per-index folds that fed them; what a session is still good for is
// naming the evening somebody lost four in a row, which is what the Sunday
// Discord recap does with it — the one caller left.

export type SessionInput = {
  win: boolean;
  game_creation: string;
  game_duration_seconds: number;
};

export type Session = {
  startedAt: Date;
  endedAt: Date;
  games: SessionInput[];
  wins: number;
};

// A gap this long between the start of one game and the next is a new session.
// Two hours comfortably covers a queue dodge, a champ select, and a snack.
export const SESSION_GAP_MINUTES = 120;

export function groupIntoSessions(
  rows: SessionInput[],
  gapMinutes = SESSION_GAP_MINUTES,
): Session[] {
  const ordered = [...rows].sort(
    (a, b) => new Date(a.game_creation).getTime() - new Date(b.game_creation).getTime(),
  );

  const gapMs = gapMinutes * 60 * 1000;
  const sessions: Session[] = [];

  for (const row of ordered) {
    const startedAt = new Date(row.game_creation);
    const endedAt = new Date(startedAt.getTime() + row.game_duration_seconds * 1000);
    const current = sessions[sessions.length - 1];

    // Measured from the end of the previous game, not its start — otherwise a
    // 50-minute slugfest eats most of the gap and splits a continuous session.
    if (current && startedAt.getTime() - current.endedAt.getTime() <= gapMs) {
      current.games.push(row);
      current.endedAt = endedAt;
      if (row.win) current.wins += 1;
      continue;
    }

    sessions.push({ startedAt, endedAt, games: [row], wins: row.win ? 1 : 0 });
  }

  return sessions;
}
