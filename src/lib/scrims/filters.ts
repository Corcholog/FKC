// The scouting query: which subset of recorded games are we talking about.
//
// Every other scrim page answers "how have we done, ever". This is the one that
// answers questions with a *scope* — how do we look on this patch, against this
// opponent, in officials rather than practice, in games where we faced K'Sante
// and Maokai together. That last one is the query the whole module exists for:
// a coach preparing for a team asks it about champions, not about dates.
//
// Pure and I/O-free like the rest of lib/scrims/. The filter is applied in
// JavaScript over the games the page already loaded rather than pushed into
// PostgREST, for the same reason the aggregates are: the whole dataset is one
// season of hand-entered games, `loadScrimGames` already fetches all of it for
// every page in the section, and a champion filter is a predicate over ten
// picks per game that SQL would need a join to express.
//
// It lives in the URL, not in component state. A filtered view is the thing you
// send to a teammate ("look at our last three officials on red side"), and a
// filter you cannot link to is a filter nobody shares.

import { SCRIM_KINDS, type ScrimGameView, type ScrimKind } from "@/lib/scrims/types";

export type ScrimFilter = {
  kind: ScrimKind | null;
  /** Opponent *slug*, so the URL survives a rename and reads as a name. */
  opponentSlug: string | null;
  patch: string | null;
  /** Inclusive, on series.played_on. Plain YYYY-MM-DD, which compares as a string. */
  from: string | null;
  to: string | null;
  /** Every one of these must have been picked by us. AND, not OR — see below. */
  allyChampionIds: number[];
  /** Every one of these must have been picked by them. */
  enemyChampionIds: number[];
};

export const EMPTY_SCRIM_FILTER: ScrimFilter = {
  kind: null,
  opponentSlug: null,
  patch: null,
  from: null,
  to: null,
  allyChampionIds: [],
  enemyChampionIds: [],
};

/** What the page reads out of `searchParams`. All optional, all strings. */
export type ScrimFilterParams = {
  kind?: string;
  opponent?: string;
  patch?: string;
  from?: string;
  to?: string;
  ally?: string;
  enemy?: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Champion ids arrive as `ally=266,517`.
 *
 * Comma-separated rather than a repeated key: `searchParams` hands a repeated
 * key back as `string | string[]`, and every consumer would then have to
 * normalise a union that only ever appears here. Anything unparseable is
 * dropped silently — a hand-edited URL should narrow to nothing or to something
 * valid, never 500.
 */
function parseIds(raw: string | undefined): number[] {
  if (!raw) return [];
  const ids = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)].sort((a, b) => a - b);
}

function parseDate(raw: string | undefined): string | null {
  return raw && DATE_PATTERN.test(raw) ? raw : null;
}

export function parseScrimFilter(params: ScrimFilterParams): ScrimFilter {
  const kind = SCRIM_KINDS.find((k) => k === params.kind) ?? null;
  // from/to are swapped rather than rejected when they arrive backwards. A range
  // that silently matches nothing is the worst of the three options, and there
  // is no reading of "from December to January" that means an empty set.
  const a = parseDate(params.from);
  const b = parseDate(params.to);
  const [from, to] = a && b && a > b ? [b, a] : [a, b];

  return {
    kind,
    opponentSlug: params.opponent?.trim() || null,
    patch: params.patch?.trim() || null,
    from,
    to,
    allyChampionIds: parseIds(params.ally),
    enemyChampionIds: parseIds(params.enemy),
  };
}

/** Round-trips a filter back into a query string. Empty fields are omitted, not blanked. */
export function scrimFilterToQuery(filter: ScrimFilter): string {
  const params = new URLSearchParams();
  if (filter.kind) params.set("kind", filter.kind);
  if (filter.opponentSlug) params.set("opponent", filter.opponentSlug);
  if (filter.patch) params.set("patch", filter.patch);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.allyChampionIds.length) params.set("ally", filter.allyChampionIds.join(","));
  if (filter.enemyChampionIds.length) params.set("enemy", filter.enemyChampionIds.join(","));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function isEmptyScrimFilter(filter: ScrimFilter): boolean {
  return activeScrimFilterCount(filter) === 0;
}

/** How many constraints are set. Drives the "Clear" affordance and the count beside it. */
export function activeScrimFilterCount(filter: ScrimFilter): number {
  return (
    (filter.kind ? 1 : 0) +
    (filter.opponentSlug ? 1 : 0) +
    (filter.patch ? 1 : 0) +
    (filter.from ? 1 : 0) +
    (filter.to ? 1 : 0) +
    filter.allyChampionIds.length +
    filter.enemyChampionIds.length
  );
}

function championIdsOnSide(game: ScrimGameView, ally: boolean): Set<number> {
  const ids = new Set<number>();
  for (const pick of game.picks) if (pick.ally === ally) ids.add(pick.champion_id);
  return ids;
}

/**
 * Every game the filter admits, in the order it was given.
 *
 * **Champion filters are AND, and they are over picks only.** "We faced K'Sante
 * *and* Maokai" is a composition question — the pair is the thing being
 * prepared against — and OR would return the union, which is almost always
 * every game and therefore no answer at all. Bans are excluded because a banned
 * champion was never on the map, so counting one as "faced" would attach a
 * result to a game it had no part in.
 */
export function applyScrimFilter(
  games: ScrimGameView[],
  filter: ScrimFilter,
): ScrimGameView[] {
  return games.filter((game) => {
    if (filter.kind && game.series.kind !== filter.kind) return false;
    if (filter.opponentSlug && game.opponent.slug !== filter.opponentSlug) return false;
    // A game with no patch recorded is excluded by a patch filter rather than
    // treated as a wildcard: "how did we look on 15.3" should not be answered
    // partly with games nobody dated.
    if (filter.patch && game.patch !== filter.patch) return false;
    if (filter.from && game.series.played_on < filter.from) return false;
    if (filter.to && game.series.played_on > filter.to) return false;

    if (filter.allyChampionIds.length) {
      const ours = championIdsOnSide(game, true);
      if (!filter.allyChampionIds.every((id) => ours.has(id))) return false;
    }
    if (filter.enemyChampionIds.length) {
      const theirs = championIdsOnSide(game, false);
      if (!filter.enemyChampionIds.every((id) => theirs.has(id))) return false;
    }

    return true;
  });
}

export type ScrimFilterOptions = {
  opponents: Array<{ slug: string; name: string; games: number }>;
  /** Newest patch first, by the numeric ordering people actually mean (15.10 > 15.9). */
  patches: Array<{ patch: string; games: number }>;
  kinds: Array<{ kind: ScrimKind; games: number }>;
  /** Games with no patch recorded — the patch dropdown says so rather than hiding them. */
  untaggedPatchGames: number;
};

/**
 * The values worth offering, derived from the *unfiltered* set.
 *
 * Deliberately not from the filtered set: a dropdown that removes its own other
 * options once you pick one is a dead end — choosing "official" would leave
 * "official" as the only kind, and there would be no way back except editing
 * the URL. Each option carries its unfiltered game count, so an empty result is
 * visibly a combination that doesn't exist rather than a page that broke.
 */
export function scrimFilterOptions(games: ScrimGameView[]): ScrimFilterOptions {
  const opponents = new Map<string, { slug: string; name: string; games: number }>();
  const patches = new Map<string, number>();
  const kinds = new Map<ScrimKind, number>();
  let untaggedPatchGames = 0;

  for (const game of games) {
    const opponent = opponents.get(game.opponent.slug) ?? {
      slug: game.opponent.slug,
      name: game.opponent.name,
      games: 0,
    };
    opponent.games += 1;
    opponents.set(opponent.slug, opponent);

    if (game.patch) patches.set(game.patch, (patches.get(game.patch) ?? 0) + 1);
    else untaggedPatchGames += 1;

    kinds.set(game.series.kind, (kinds.get(game.series.kind) ?? 0) + 1);
  }

  return {
    opponents: [...opponents.values()].sort((a, b) => a.name.localeCompare(b.name)),
    patches: [...patches.entries()]
      .map(([patch, count]) => ({ patch, games: count }))
      .sort((a, b) => comparePatch(b.patch, a.patch)),
    // SCRIM_KINDS order, not count order: it runs practice → official, which is
    // how anyone reading the row thinks about them.
    kinds: SCRIM_KINDS.flatMap((kind) =>
      kinds.has(kind) ? [{ kind, games: kinds.get(kind)! }] : [],
    ),
    untaggedPatchGames,
  };
}

/**
 * Patch strings compared segment by segment as numbers.
 *
 * `"15.10".localeCompare("15.9")` is negative, which would file the newest patch
 * of a run in the middle of the list — and a patch dropdown whose top entry is
 * not the current patch is wrong in the way nobody checks.
 */
export function comparePatch(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = Number.parseInt(left[i] ?? "0", 10);
    const r = Number.parseInt(right[i] ?? "0", 10);
    // A non-numeric segment (someone typed "15.3b") falls back to text so the
    // comparison stays total instead of collapsing to NaN and reporting equal.
    if (Number.isNaN(l) || Number.isNaN(r)) return a.localeCompare(b);
    if (l !== r) return l - r;
  }
  return 0;
}
