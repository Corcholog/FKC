// Scouting: who plays for the other university, and what they play.
//
// Their rosters are *derived* from the nicknames typed on enemy picks rather
// than stored in a table of their own. The tradeoff is deliberate: a real
// opponent-player table would need every enemy registered before a draft could
// be entered, which is exactly the kind of friction that stops people entering
// drafts. Grouping on (role, lowercased nickname) gets "their toplaner is
// Peluca, who has played Renekton x4" for free, and the cost is that a typo
// splits one person into two — fixable by editing the series.
//
// Picks with no nickname still count toward the team's pools; they just don't
// belong to a named person.

import { byGamesThenRecord } from "@/lib/champion-stats";
import type { ChampionPickAgg } from "@/lib/scrims/draft-stats";
import type { ScrimGameView } from "@/lib/scrims/types";

export type OpponentPlayer = {
  /** The nickname as first seen, with its original casing. */
  name: string;
  teamPosition: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  champions: ChampionPickAgg[];
};

/**
 * The opponent's players, grouped by role then games played.
 *
 * `games` here is *their* games, and `wins` theirs too — `game.win` is ours, so
 * it's negated throughout.
 */
export function deriveOpponentRoster(games: ScrimGameView[]): OpponentPlayer[] {
  type Bucket = Omit<OpponentPlayer, "champions"> & { champions: Map<number, ChampionPickAgg> };
  const byKey = new Map<string, Bucket>();

  for (const game of games) {
    const theyWon = !game.win;
    for (const pick of game.picks) {
      if (pick.ally) continue;

      const nickname = pick.player_name?.trim();
      if (!nickname) continue;

      const key = `${pick.team_position}:${nickname.toLowerCase()}`;
      const bucket: Bucket = byKey.get(key) ?? {
        name: nickname,
        teamPosition: pick.team_position,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        champions: new Map(),
      };

      bucket.games += 1;
      if (theyWon) bucket.wins += 1;
      bucket.kills += pick.kills;
      bucket.deaths += pick.deaths;
      bucket.assists += pick.assists;

      const champ = bucket.champions.get(pick.champion_id) ?? {
        championId: pick.champion_id,
        championName: pick.champion_name,
        games: 0,
        wins: 0,
      };
      champ.games += 1;
      if (theyWon) champ.wins += 1;
      bucket.champions.set(pick.champion_id, champ);

      byKey.set(key, bucket);
    }
  }

  return [...byKey.values()]
    .map((b) => ({ ...b, champions: [...b.champions.values()].sort(byGamesThenRecord) }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}

/**
 * How many of this opponent's enemy picks carried a nickname.
 *
 * The scouting page needs this to tell "we've never named their players" apart
 * from "they genuinely have no roster yet" — an empty roster list is otherwise
 * indistinguishable from a data-entry gap, and the fix for each is different.
 */
export function namedPickCoverage(games: ScrimGameView[]): { named: number; total: number } {
  let named = 0;
  let total = 0;
  for (const game of games) {
    for (const pick of game.picks) {
      if (pick.ally) continue;
      total += 1;
      if (pick.player_name?.trim()) named += 1;
    }
  }
  return { named, total };
}
