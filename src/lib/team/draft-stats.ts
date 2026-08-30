// What gets picked and what gets banned.
//
// The most useful half of team-match tracking: a draft pattern is what you actually
// prepare against, and unlike per-game stats it stays true across patches.
//
// A note on what *isn't* here: pick order. The entry form doesn't collect it —
// that would be ten more fields a game on top of the draft and the K/D/A/CS —
// so nothing below claims to know who first-picked or who countered whom. Side
// is recorded, and blue side picks first, so `hadFirstPick` in ./types.ts is as
// close as this data gets. Ban *order* is free (you type bans in order anyway)
// and is kept.

import { byGamesThenRecord, byWinRateThenGames } from "@/lib/champion-stats";
import type { TeamGameView } from "@/lib/team/types";

/**
 * Deliberately named `games`/`wins` rather than `picks`: that's the shape
 * byGamesThenRecord and byWinRateThenGames take, so team champion lists sort
 * by the same rules as every soloq one.
 */
export type ChampionPickAgg = {
  championId: number;
  championName: string;
  games: number;
  wins: number;
};

export type ChampionBanCount = {
  championId: number;
  count: number;
  /** Times it was the side's *first* ban — the closest thing to a priority signal. */
  firstCount: number;
};

export type ChampionPresence = {
  championId: number;
  picked: number;
  banned: number;
  /** (picked + banned) / games in the sample, as a rounded percentage. */
  presence: number;
};

export type DraftSide = "ally" | "enemy";

function pickAggKey(agg: Map<number, ChampionPickAgg>, id: number, name: string): ChampionPickAgg {
  const existing = agg.get(id);
  if (existing) return existing;
  const created = { championId: id, championName: name, games: 0, wins: 0 };
  agg.set(id, created);
  return created;
}

/**
 * Champions one side picked, with their record on them.
 *
 * A pick's result is its team's result: `game.win` is ours, so the enemy's
 * record is its negation.
 */
export function aggregatePicks(games: TeamGameView[], side: DraftSide): ChampionPickAgg[] {
  const wantAlly = side === "ally";
  const byChampion = new Map<number, ChampionPickAgg>();

  for (const game of games) {
    const won = wantAlly ? game.win : !game.win;
    for (const pick of game.picks) {
      if (pick.ally !== wantAlly) continue;
      const agg = pickAggKey(byChampion, pick.champion_id, pick.champion_name);
      agg.games += 1;
      if (won) agg.wins += 1;
    }
  }

  return [...byChampion.values()].sort(byGamesThenRecord);
}

/** The same, split by role — a champion pool per lane. */
export function aggregatePicksByRole(
  games: TeamGameView[],
  side: DraftSide,
): Map<string, ChampionPickAgg[]> {
  const wantAlly = side === "ally";
  const byRole = new Map<string, Map<number, ChampionPickAgg>>();

  for (const game of games) {
    const won = wantAlly ? game.win : !game.win;
    for (const pick of game.picks) {
      if (pick.ally !== wantAlly) continue;
      const roleMap = byRole.get(pick.team_position) ?? new Map<number, ChampionPickAgg>();
      const agg = pickAggKey(roleMap, pick.champion_id, pick.champion_name);
      agg.games += 1;
      if (won) agg.wins += 1;
      byRole.set(pick.team_position, roleMap);
    }
  }

  return new Map(
    [...byRole.entries()].map(([role, champs]) => [role, [...champs.values()].sort(byGamesThenRecord)]),
  );
}

/**
 * Ban counts for one side.
 *
 * `by: "ally"` is what we take away from them. `by: "enemy"` is the respect
 * list — what they take away from us, which is the single most actionable
 * number in here: it tells you which of your picks the field is scared of, and
 * therefore what you'll never get in a real game.
 *
 * Champion *names* aren't returned: bans are stored as bare ids, and the caller
 * already has the DDragon map for icons. Same as the tier list board.
 */
export function countBans(games: TeamGameView[], by: DraftSide): ChampionBanCount[] {
  const byChampion = new Map<number, ChampionBanCount>();

  for (const game of games) {
    const bans = by === "ally" ? game.ally_bans : game.enemy_bans;
    bans.forEach((championId, index) => {
      const entry = byChampion.get(championId) ?? { championId, count: 0, firstCount: 0 };
      entry.count += 1;
      if (index === 0) entry.firstCount += 1;
      byChampion.set(championId, entry);
    });
  }

  return [...byChampion.values()].sort(
    (a, b) => b.count - a.count || b.firstCount - a.firstCount || a.championId - b.championId,
  );
}

/**
 * How often a champion was in the draft at all — picked by anyone, or banned by
 * anyone. The standard "presence" metric, and the honest answer to "is this
 * champion relevant in our meta".
 */
export function championPresence(games: TeamGameView[]): ChampionPresence[] {
  const byChampion = new Map<number, { picked: number; banned: number }>();
  const bump = (id: number, key: "picked" | "banned") => {
    const entry = byChampion.get(id) ?? { picked: 0, banned: 0 };
    entry[key] += 1;
    byChampion.set(id, entry);
  };

  for (const game of games) {
    for (const pick of game.picks) bump(pick.champion_id, "picked");
    for (const id of game.ally_bans) bump(id, "banned");
    for (const id of game.enemy_bans) bump(id, "banned");
  }

  const total = games.length;
  return [...byChampion.entries()]
    .map(([championId, e]) => ({
      championId,
      picked: e.picked,
      banned: e.banned,
      presence: total === 0 ? 0 : Math.round(((e.picked + e.banned) / total) * 100),
    }))
    .sort(
      (a, b) =>
        b.presence - a.presence ||
        b.picked + b.banned - (a.picked + a.banned) ||
        a.championId - b.championId,
    );
}

/**
 * Every champion *played* in a series — the fearless pool, for saved games.
 *
 * Bans are not included. Fearless removes champions that were picked; one that
 * was banned in game 1 and never played is still available afterwards, to pick
 * or to ban again. This mirrors `pickedInGame` in the entry form, which applies
 * the same rule to a series being typed in; the two must agree, or the form
 * would grey a champion that a saved series says is fair game.
 *
 * (Some organisers do count bans. If that format ever comes up, this and
 * `usedEarlierInSeries` are the two places that change.)
 */
export function championsUsedInSeries(games: TeamGameView[]): Set<number> {
  const used = new Set<number>();
  for (const game of games) {
    for (const pick of game.picks) used.add(pick.champion_id);
  }
  return used;
}

export { byGamesThenRecord, byWinRateThenGames };
