// Queue sessions — consecutive games with no meaningful break between them.
//
// The interesting question this answers isn't "how many games did you play"
// but "how did the 7th game of the night go compared to the 1st", which is the
// closest thing to a measurable tilt signal available without the timeline API.

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

export type GameIndexPoint = {
  /** 1-based position within a session. */
  index: number;
  games: number;
  wins: number;
  winRate: number;
};

// Everything past this index is folded into the last bucket — sessions that
// long are rare enough that each further point would rest on a handful of games.
export const MAX_SESSION_INDEX = 10;

// Winrate by how deep into a session the game was. Sessions get shorter as the
// index rises, so each point carries its own sample size — the tail is always
// built on fewer games than the head and the chart has to say so.
export function winRateByGameIndex(
  sessions: Session[],
  maxIndex = MAX_SESSION_INDEX,
): GameIndexPoint[] {
  const buckets = new Map<number, { games: number; wins: number }>();

  for (const session of sessions) {
    session.games.forEach((game, i) => {
      const index = Math.min(i + 1, maxIndex);
      const bucket = buckets.get(index) ?? { games: 0, wins: 0 };
      bucket.games += 1;
      if (game.win) bucket.wins += 1;
      buckets.set(index, bucket);
    });
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, bucket]) => ({
      index,
      games: bucket.games,
      wins: bucket.wins,
      winRate: Math.round((bucket.wins / bucket.games) * 100),
    }));
}

export type IndexRecord = { ownerId: string; games: number; wins: number };

// The same buckets as winRateByGameIndex, but kept split by whose sessions they
// came from — so a dip at game 7 can be traced to the people actually playing
// seven-game nights instead of being read as a clan-wide law of tilt.
//
// Sessions have to arrive already grouped per player: one roster-wide timeline
// would splice five people's evenings into a single fictional marathon.
export function gameIndexByOwner(
  sessionsByOwner: Map<string, Session[]>,
  maxIndex = MAX_SESSION_INDEX,
): Map<number, IndexRecord[]> {
  const byIndex = new Map<number, Map<string, IndexRecord>>();

  for (const [ownerId, sessions] of sessionsByOwner) {
    for (const session of sessions) {
      session.games.forEach((game, i) => {
        const index = Math.min(i + 1, maxIndex);
        const owners = byIndex.get(index) ?? new Map<string, IndexRecord>();
        const record = owners.get(ownerId) ?? { ownerId, games: 0, wins: 0 };
        record.games += 1;
        if (game.win) record.wins += 1;
        owners.set(ownerId, record);
        byIndex.set(index, owners);
      });
    }
  }

  return new Map(
    [...byIndex.entries()].map(([index, owners]) => [
      index,
      [...owners.values()].sort((a, b) => b.games - a.games),
    ]),
  );
}

export function longestSession(sessions: Session[]): Session | null {
  return sessions.reduce<Session | null>(
    (longest, s) => (!longest || s.games.length > longest.games.length ? s : longest),
    null,
  );
}
