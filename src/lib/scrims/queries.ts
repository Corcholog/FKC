// The one read path for scrim data.
//
// Every scrim page needs the same thing — games, with their draft and their
// opponent attached — and then folds it differently. So this loads it once, in
// full, and the stat modules stay pure functions over the result.
//
// Four round trips instead of one embedded query on purpose: PostgREST embeds
// of an embed get awkward to type and impossible to page correctly, and the
// opponent list is ~20 rows that every series shares. Joining in JS is cheaper
// than either.

import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import { maybeRow } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import type {
  ScrimGameRow,
  ScrimGameView,
  ScrimOpponentRow,
  ScrimPickRow,
  ScrimSeriesRow,
} from "@/lib/scrims/types";

const OPPONENT_COLUMNS = "id, name, slug, notes, created_at";
// created_by is asked for only privately: it is who entered the series, an auth
// user id, and demo_scrim_series drops it. Nothing renders it — the write path
// is its only reader — so the demo simply never selects it.
const SERIES_BASE_COLUMNS = "id, opponent_id, played_on, kind, fearless, notes, created_at";
const seriesColumns = (source: DataSource) =>
  source.demo ? SERIES_BASE_COLUMNS : `${SERIES_BASE_COLUMNS}, created_by`;
// No notes column — a game's notes are a thread, loaded by lib/scrims/notes.ts
// only on the two pages that render them.
const GAME_COLUMNS =
  "id, series_id, game_number, side, win, duration_seconds, patch, ally_bans, enemy_bans";
const PICK_COLUMNS =
  "id, game_id, ally, team_position, champion_id, champion_name, player_id, player_name, kills, deaths, assists, total_cs";

export async function loadOpponents(source: DataSource): Promise<ScrimOpponentRow[]> {
  return fetchAllRows<ScrimOpponentRow>((from, to) =>
    source.supabase
      .from(source.table("scrim_opponents"))
      .select(OPPONENT_COLUMNS)
      .order("name")
      .order("id") // total order, so paging can't overlap — see loadScrimGames
      .range(from, to)
      .returns<ScrimOpponentRow[]>(),
  );
}

export async function findOpponentBySlug(
  source: DataSource,
  slug: string,
): Promise<ScrimOpponentRow | null> {
  // A failed read here used to be indistinguishable from an unknown slug, and
  // every caller turns null into notFound() — so a blip claimed the opponent had
  // been deleted.
  return maybeRow(
    await source.supabase
      .from(source.table("scrim_opponents"))
      .select(OPPONENT_COLUMNS)
      .eq("slug", slug)
      .maybeSingle<ScrimOpponentRow>(),
    "scrim opponent",
  );
}

/**
 * Every recorded game, newest series first, each with its full draft.
 *
 * `fetchAllRows`/`fetchAllByIds` rather than plain selects because PostgREST
 * truncates at the project's Max rows setting *silently* — and at ten picks per
 * game that ceiling is only a hundred games, which one tournament season
 * passes. A truncated read here produces stats that are wrong, not obviously
 * broken. Same reasoning as every soloq aggregate; see lib/supabase/fetch-all.ts.
 */
export async function loadScrimGames(
  source: DataSource,
  options: { opponentId?: string; seriesId?: string } = {},
): Promise<ScrimGameView[]> {
  // Every paged query below ends on a column combination that is *unique*, and
  // that is not cosmetic. `.range()` paging is only coherent if the underlying
  // order is total: Postgres gives no ordering guarantee without ORDER BY, so
  // two windows over an ambiguous sort can overlap or skip rows entirely. Under
  // one page it never shows; past a page it silently duplicates and drops
  // drafts. Same class of bug fetch-all.ts exists to prevent, one level down.
  const series = await fetchAllRows<ScrimSeriesRow>((from, to) => {
    let q = source.supabase.from(source.table("scrim_series")).select(seriesColumns(source));
    if (options.opponentId) q = q.eq("opponent_id", options.opponentId);
    if (options.seriesId) q = q.eq("id", options.seriesId);
    return q
      .order("played_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id") // tie-break: two series on one day can share a timestamp
      .range(from, to)
      .returns<ScrimSeriesRow[]>();
  });
  if (series.length === 0) return [];

  const games = await fetchAllByIds<ScrimGameRow>(
    series.map((s) => s.id),
    (chunk, from, to) =>
      source.supabase
        .from(source.table("scrim_games"))
        .select(GAME_COLUMNS)
        .in("series_id", chunk)
        // unique (series_id, game_number) — a total order, and it matches
        // idx_scrim_games_series so the sort is free.
        .order("series_id")
        .order("game_number")
        .range(from, to)
        .returns<ScrimGameRow[]>(),
  );
  if (games.length === 0) return [];

  const [picks, opponents] = await Promise.all([
    fetchAllByIds<ScrimPickRow>(
      games.map((g) => g.id),
      (chunk, from, to) =>
        source.supabase
          .from(source.table("scrim_picks"))
          .select(PICK_COLUMNS)
          .in("game_id", chunk)
          .order("game_id")
          .order("id") // the primary key, so the pair is total
          .range(from, to)
          .returns<ScrimPickRow[]>(),
    ),
    loadOpponents(source),
  ]);

  const seriesById = new Map(series.map((s) => [s.id, s]));
  const opponentById = new Map(opponents.map((o) => [o.id, o]));
  const picksByGame = new Map<string, ScrimPickRow[]>();
  for (const pick of picks) {
    const list = picksByGame.get(pick.game_id) ?? [];
    list.push(pick);
    picksByGame.set(pick.game_id, list);
  }

  // Series order already came back from Postgres; the JS sort below only has to
  // keep games within a series in playing order. A game whose series or
  // opponent is missing is dropped rather than rendered half-blank — the
  // foreign keys make that unreachable, but the types don't know it.
  return games
    .flatMap((game) => {
      const parent = seriesById.get(game.series_id);
      const opponent = parent ? opponentById.get(parent.opponent_id) : undefined;
      if (!parent || !opponent) return [];
      return [{ ...game, series: parent, opponent, picks: picksByGame.get(game.id) ?? [] }];
    })
    .sort(
      (a, b) =>
        b.series.played_on.localeCompare(a.series.played_on) ||
        b.series.created_at.localeCompare(a.series.created_at) ||
        a.game_number - b.game_number,
    );
}

/** The games of one series, in playing order. */
export async function loadSeries(
  source: DataSource,
  seriesId: string,
): Promise<ScrimGameView[]> {
  return loadScrimGames(source, { seriesId });
}

/**
 * Games regrouped into the series they belong to, newest first.
 *
 * The history page and the "recent series" strip both want this, and neither
 * wants to redo the grouping.
 */
export function groupBySeries(games: ScrimGameView[]): Array<{
  series: ScrimSeriesRow;
  opponent: ScrimOpponentRow;
  games: ScrimGameView[];
}> {
  const bySeries = new Map<string, { series: ScrimSeriesRow; opponent: ScrimOpponentRow; games: ScrimGameView[] }>();
  for (const game of games) {
    const entry = bySeries.get(game.series_id) ?? {
      series: game.series,
      opponent: game.opponent,
      games: [],
    };
    entry.games.push(game);
    bySeries.set(game.series_id, entry);
  }
  // Insertion order is already newest-first: loadScrimGames sorted that way.
  return [...bySeries.values()];
}
