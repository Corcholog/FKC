// The one read path for team-match data.
//
// Every page in the team section needs the same thing — games, with their
// draft, their opponent and (for an official) their competition attached — and
// then folds it differently. So this loads it once, in full, and the stat
// modules stay pure functions over the result.
//
// Four round trips instead of one embedded query on purpose: PostgREST embeds
// of an embed get awkward to type and impossible to page correctly, and the
// opponent list is ~20 rows that every series shares. Joining in JS is cheaper
// than either.

import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import { maybeRow } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import type {
  CompetitionRow,
  TeamGameRow,
  TeamGameView,
  TeamOpponentRow,
  TeamPickRow,
  TeamSeriesRow,
} from "@/lib/team/types";

const OPPONENT_COLUMNS = "id, name, slug, notes, target_bans, created_at";
// created_by is asked for only privately: it is who entered the series, an auth
// user id, and demo_team_series drops it. Nothing renders it — the write path
// is its only reader — so the demo simply never selects it.
const SERIES_BASE_COLUMNS =
  "id, opponent_id, played_on, kind, fearless, notes, competition_id, stage, created_at";
const COMPETITION_COLUMNS = "id, name, slug, starts_on, ends_on";
const seriesColumns = (source: DataSource) =>
  source.demo ? SERIES_BASE_COLUMNS : `${SERIES_BASE_COLUMNS}, created_by`;
// No notes column — a game's notes are a thread, loaded by lib/team/notes.ts
// only on the two pages that render them.
const GAME_COLUMNS =
  "id, series_id, game_number, side, win, duration_seconds, patch, ally_bans, enemy_bans";
const PICK_COLUMNS =
  "id, game_id, ally, team_position, champion_id, champion_name, player_id, player_name, kills, deaths, assists, total_cs";

/**
 * Every competition. Unpaged on purpose — there are a handful, not a season's
 * worth, and loadTeamGames needs the whole set to resolve its series anyway.
 */
export async function loadCompetitions(source: DataSource): Promise<CompetitionRow[]> {
  return fetchAllRows<CompetitionRow>((from, to) =>
    source.supabase
      .from(source.table("competitions"))
      .select(COMPETITION_COLUMNS)
      // Newest first: the competition being played is the one anybody is
      // entering games for. Nulls last so an undated one doesn't lead.
      .order("starts_on", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, to)
      .returns<CompetitionRow[]>(),
  );
}

export async function loadOpponents(source: DataSource): Promise<TeamOpponentRow[]> {
  return fetchAllRows<TeamOpponentRow>((from, to) =>
    source.supabase
      .from(source.table("team_opponents"))
      .select(OPPONENT_COLUMNS)
      .order("name")
      .order("id") // total order, so paging can't overlap — see loadTeamGames
      .range(from, to)
      .returns<TeamOpponentRow[]>(),
  );
}

export async function findOpponentBySlug(
  source: DataSource,
  slug: string,
): Promise<TeamOpponentRow | null> {
  // A failed read here used to be indistinguishable from an unknown slug, and
  // every caller turns null into notFound() — so a blip claimed the opponent had
  // been deleted.
  return maybeRow(
    await source.supabase
      .from(source.table("team_opponents"))
      .select(OPPONENT_COLUMNS)
      .eq("slug", slug)
      .maybeSingle<TeamOpponentRow>(),
    "team opponent",
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
export async function loadTeamGames(
  source: DataSource,
  options: { opponentId?: string; seriesId?: string } = {},
): Promise<TeamGameView[]> {
  // Every paged query below ends on a column combination that is *unique*, and
  // that is not cosmetic. `.range()` paging is only coherent if the underlying
  // order is total: Postgres gives no ordering guarantee without ORDER BY, so
  // two windows over an ambiguous sort can overlap or skip rows entirely. Under
  // one page it never shows; past a page it silently duplicates and drops
  // drafts. Same class of bug fetch-all.ts exists to prevent, one level down.
  const series = await fetchAllRows<TeamSeriesRow>((from, to) => {
    let q = source.supabase.from(source.table("team_series")).select(seriesColumns(source));
    if (options.opponentId) q = q.eq("opponent_id", options.opponentId);
    if (options.seriesId) q = q.eq("id", options.seriesId);
    return q
      .order("played_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id") // tie-break: two series on one day can share a timestamp
      .range(from, to)
      .returns<TeamSeriesRow[]>();
  });
  if (series.length === 0) return [];

  const games = await fetchAllByIds<TeamGameRow>(
    series.map((s) => s.id),
    (chunk, from, to) =>
      source.supabase
        .from(source.table("team_games"))
        .select(GAME_COLUMNS)
        .in("series_id", chunk)
        // unique (series_id, game_number) — a total order, and it matches
        // idx_team_games_series so the sort is free.
        .order("series_id")
        .order("game_number")
        .range(from, to)
        .returns<TeamGameRow[]>(),
  );
  if (games.length === 0) return [];

  const [picks, opponents, competitions] = await Promise.all([
    fetchAllByIds<TeamPickRow>(
      games.map((g) => g.id),
      (chunk, from, to) =>
        source.supabase
          .from(source.table("team_picks"))
          .select(PICK_COLUMNS)
          .in("game_id", chunk)
          .order("game_id")
          .order("id") // the primary key, so the pair is total
          .range(from, to)
          .returns<TeamPickRow[]>(),
    ),
    loadOpponents(source),
    loadCompetitions(source),
  ]);

  const seriesById = new Map(series.map((s) => [s.id, s]));
  const opponentById = new Map(opponents.map((o) => [o.id, o]));
  const competitionById = new Map(competitions.map((c) => [c.id, c]));
  const picksByGame = new Map<string, TeamPickRow[]>();
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
      // Unlike the two above, a missing competition does not drop the game: the
      // FK is `on delete set null`, so a deleted tournament leaves its games
      // behind on purpose. They are still games the team played.
      const competition = parent.competition_id
        ? (competitionById.get(parent.competition_id) ?? null)
        : null;
      return [
        { ...game, series: parent, opponent, competition, picks: picksByGame.get(game.id) ?? [] },
      ];
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
): Promise<TeamGameView[]> {
  return loadTeamGames(source, { seriesId });
}

/**
 * Games regrouped into the series they belong to, newest first.
 *
 * The history page and the "recent series" strip both want this, and neither
 * wants to redo the grouping.
 */
export type SeriesGroup = {
  series: TeamSeriesRow;
  opponent: TeamOpponentRow;
  /** Every game in a series shares it, so it is carried on the group too. */
  competition: CompetitionRow | null;
  games: TeamGameView[];
};

export function groupBySeries(games: TeamGameView[]): SeriesGroup[] {
  const bySeries = new Map<string, SeriesGroup>();
  for (const game of games) {
    const entry = bySeries.get(game.series_id) ?? {
      series: game.series,
      opponent: game.opponent,
      competition: game.competition,
      games: [],
    };
    entry.games.push(game);
    bySeries.set(game.series_id, entry);
  }
  // Insertion order is already newest-first: loadTeamGames sorted that way.
  return [...bySeries.values()];
}
