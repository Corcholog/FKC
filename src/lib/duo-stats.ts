// Who plays with whom, and how it goes.
//
// Everything here comes out of match_participants as it already exists — two
// tracked players in the same match_id are either on the same team_id (a duo)
// or on opposite ones (a civil war). No extra Riot calls, no new columns.

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

export type CivilWarRecord = {
  a: string;
  b: string;
  games: number;
  /** Games `a` won. `b` won the rest — one of them always did. */
  aWins: number;
};

export type DuoStats = {
  duos: DuoRecord[];
  civilWars: CivilWarRecord[];
  /** Per player: how they do in games where no other tracked player is present. */
  soloGames: Map<string, { games: number; wins: number }>;
};

// Pair keys are order-independent, so a duo isn't counted twice under both
// orderings. Sorting the two ids gives one canonical key.
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function aggregateDuoStats(rows: DuoInput[]): DuoStats {
  const byMatch = new Map<string, DuoInput[]>();
  for (const row of rows) {
    if (!row.player_id) continue;
    const list = byMatch.get(row.match_id) ?? [];
    list.push(row);
    byMatch.set(row.match_id, list);
  }

  const duos = new Map<string, DuoRecord>();
  const civilWars = new Map<string, CivilWarRecord>();
  const soloGames = new Map<string, { games: number; wins: number }>();

  for (const participants of byMatch.values()) {
    if (participants.length === 1) {
      const only = participants[0];
      const solo = soloGames.get(only.player_id as string) ?? { games: 0, wins: 0 };
      solo.games += 1;
      if (only.win) solo.wins += 1;
      soloGames.set(only.player_id as string, solo);
      continue;
    }

    // Every unordered pair of tracked players in this match. A five-stack is 10
    // pairs, which is the intent — each duo's record should count that game.
    for (let i = 0; i < participants.length; i += 1) {
      for (let j = i + 1; j < participants.length; j += 1) {
        const left = participants[i];
        const right = participants[j];
        const a = left.player_id as string;
        const b = right.player_id as string;
        const key = pairKey(a, b);

        if (left.team_id === right.team_id) {
          const record = duos.get(key) ?? { a, b, games: 0, wins: 0 };
          record.games += 1;
          if (left.win) record.wins += 1;
          duos.set(key, record);
        } else {
          // Store under the canonical ordering so aWins always refers to the
          // same player no matter which row was read first.
          const [first, second] = a < b ? [left, right] : [right, left];
          const record = civilWars.get(key) ?? {
            a: first.player_id as string,
            b: second.player_id as string,
            games: 0,
            aWins: 0,
          };
          record.games += 1;
          if (first.win) record.aWins += 1;
          civilWars.set(key, record);
        }
      }
    }
  }

  return {
    duos: [...duos.values()].sort((x, y) => y.games - x.games),
    civilWars: [...civilWars.values()].sort((x, y) => y.games - x.games),
    soloGames,
  };
}

export function duoWinRate(record: DuoRecord): number {
  return record.games === 0 ? 0 : Math.round((record.wins / record.games) * 100);
}

// How much better (or worse) a pair does together than the two of them do alone.
// Null when either player has no solo games to compare against — an unqualified
// "+40%" off a nonexistent baseline is worse than saying nothing.
export function duoSynergy(record: DuoRecord, stats: DuoStats): number | null {
  const soloA = stats.soloGames.get(record.a);
  const soloB = stats.soloGames.get(record.b);
  if (!soloA?.games || !soloB?.games) return null;

  const baseline = ((soloA.wins / soloA.games + soloB.wins / soloB.games) / 2) * 100;
  return Math.round(duoWinRate(record) - baseline);
}

// Duos below this are noise — two games at 100% is not a synergy.
export const MIN_DUO_GAMES = 3;
