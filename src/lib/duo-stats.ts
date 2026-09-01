// Who plays with whom, and how it goes.
//
// Everything here comes out of match_participants as it already exists — two
// tracked players in the same match_id are either on the same team_id (a duo) or
// on opposite ones. No extra Riot calls, no new columns.
//
// One reader left: the Sunday Discord recap. The /insights matrix that showed
// every pair is gone (ADR-052), and with it `duoSynergy` and the per-player solo
// baseline it measured against — a recap names one duo, and "how much better
// than alone" is a claim that needed a matrix around it to be readable.

export type DuoInput = {
  match_id: string;
  player_id: string | null;
  team_id: number;
  win: boolean;
};

export type DuoRecord = {
  a: string;
  b: string;
  games: number;
  wins: number;
};

// Pair keys are order-independent, so a duo isn't counted twice under both
// orderings. Sorting the two ids gives one canonical key.
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Every pair that shared a game, most games first. */
export function aggregateDuoStats(rows: DuoInput[]): DuoRecord[] {
  const byMatch = new Map<string, DuoInput[]>();
  for (const row of rows) {
    if (!row.player_id) continue;
    const list = byMatch.get(row.match_id) ?? [];
    list.push(row);
    byMatch.set(row.match_id, list);
  }

  const duos = new Map<string, DuoRecord>();

  for (const participants of byMatch.values()) {
    // Every unordered pair of tracked players in this match. A five-stack is 10
    // pairs, which is the intent — each duo's record should count that game.
    for (let i = 0; i < participants.length; i += 1) {
      for (let j = i + 1; j < participants.length; j += 1) {
        const left = participants[i];
        const right = participants[j];
        const a = left.player_id as string;
        const b = right.player_id as string;
        const key = pairKey(a, b);

        // Opposite teams is not a duo. It used to be counted as a "civil war"
        // and shown on the old /insights; both are gone, and with five people
        // who queue together on purpose it was mostly an empty panel.
        if (left.team_id !== right.team_id) continue;

        const record = duos.get(key) ?? { a, b, games: 0, wins: 0 };
        record.games += 1;
        if (left.win) record.wins += 1;
        duos.set(key, record);
      }
    }
  }

  return [...duos.values()].sort((x, y) => y.games - x.games);
}

export function duoWinRate(record: DuoRecord): number {
  return record.games === 0 ? 0 : Math.round((record.wins / record.games) * 100);
}

// Duos below this are noise — two games at 100% is not a synergy.
export const MIN_DUO_GAMES = 3;
