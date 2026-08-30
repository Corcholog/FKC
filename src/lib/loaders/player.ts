// Everything one player's page reads, and everything it folds that read into.
//
// Split in two for the reason demo-cache.ts spells out: `fetchPlayerProfileRows`
// returns plain arrays and is safe to put behind the data cache, while
// `buildPlayerProfile` returns Maps, which do not survive a cache round trip.
// Fetch, then fold — the same separation the rest of the codebase uses between
// pages and lib/*-stats.ts, here forced by the cache rather than by taste.

import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import { maybeRow, optional, rows } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import { aggregateByRole, type PlayerAgg } from "@/lib/player-stats";
import { describeSample, fromParticipant, type UnifiedRow } from "@/lib/unified";
import { QUEUE_FLEX } from "@/lib/queues";
import { topChampionsByPlayer, type ChampionAgg } from "@/lib/champion-stats";
import { computeStreak, formatStreak, type Streak } from "@/lib/streaks";
import { matchupsForPlayer, nemesis, type MatchupAgg, type MatchupInput } from "@/lib/matchups";
import { aggregateByTime, type HourWeekdayStats } from "@/lib/time-stats";
import {
  aggregateByDuration,
  durationSwing,
  winRatePastMinute,
  type DurationBucketAgg,
  type DurationSwing,
  type SurvivalPoint,
} from "@/lib/duration-stats";
import { laneDiffForPlayer, type LaneDiffAgg, type LaneDiffInput } from "@/lib/lane-diff";
import { aggregateBySide, type SideSplit } from "@/lib/side-stats";
import { ladderPoints } from "@/lib/rank";
import type { LpPoint } from "@/components/charts/lp-chart";

export const RECENT_FORM_LIMIT = 5;
export const TOP_CHAMPION_COUNT = 5;

/**
 * The roster row, as wide as the view needs.
 *
 * The private page selects `*`, which is the widest leak in the app — but
 * against `demo_players` that same `*` is safe by construction, because the
 * sensitive columns are not in the view. The shape below is what the view
 * actually reads either way.
 */
export type PlayerRecord = {
  id: string;
  slug: string;
  display_name: string;
  riot_game_name: string;
  riot_tag_line: string;
  avatar_url: string | null;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  wins: number | null;
  losses: number | null;
  ai_summary_enabled?: boolean | null;
};

export type MatchListRow = {
  id: string;
  /** Absent on the demo — see the note on MatchRowData.riotMatchId. */
  riot_match_id: string | null;
  game_creation: string;
  game_duration_seconds: number;
};

type OwnRow = MatchupInput & {
  total_cs: number;
  damage_dealt_to_champions: number;
  queue_id: number;
  matches: { game_creation: string; game_duration_seconds: number } | null;
};

/** An own row with the embed flattened onto it — what every aggregate takes. */
export type HistoryRow = Omit<OwnRow, "matches"> & {
  game_creation: string;
  game_duration_seconds: number;
};

export type RankHistoryRow = {
  tier: string | null;
  division: string | null;
  league_points: number | null;
  recorded_at: string;
};

export type AiSummaryRow = {
  summary_text: string | null;
  generated_at: string | null;
  /** Absent on the demo — nothing regenerates that text on a schedule. */
  stale?: boolean | null;
};

export type PlayerProfileRows = {
  player: PlayerRecord;
  /**
   * Team-match picks as unified rows, when the scope asks for them.
   *
   * Empty rather than absent when the scope is Riot-only, so every consumer
   * folds the same array either way instead of branching.
   */
  teamRows: UnifiedRow[];
  matchList: MatchListRow[];
  historyRows: HistoryRow[];
  /** All ten participants of every match in the history — enemies included. */
  allHistoryParticipants: (MatchupInput & LaneDiffInput)[];
  rankHistory: RankHistoryRow[];
  /** On the demo this is the hand-reviewed analyst text, not the private one. */
  aiSummary: AiSummaryRow | null;
};

// queue_id rides along because a ranked scope holds both queues, and a row
// that cannot say which one it came from cannot be labelled or split.
const OWN_ROW_COLUMNS =
  "match_id, player_id, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, total_cs, damage_dealt_to_champions, queue_id";

// gold_earned, total_cs and damage_dealt_to_champions ride along for the lane
// differentials: they are the enemy laner's copies of columns the player's own
// rows already carry, and this is the only query that sees the opposing team.
const ALL_PARTICIPANT_COLUMNS =
  "match_id, player_id, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, gold_earned, total_cs, damage_dealt_to_champions";

/** Null when there is genuinely no such player. A failed read throws instead. */
export async function fetchPlayerProfileRows(
  source: DataSource,
  slug: string,
  /**
   * Team-match rows to fold in, already scoped to this player by the caller.
   *
   * Passed in rather than fetched here because loading them needs the whole
   * team-match read path (lib/team/queries.ts), and this module deliberately
   * knows only about the Riot tables.
   */
  teamRows: UnifiedRow[] = [],
): Promise<PlayerProfileRows | null> {
  const player = maybeRow(
    await source.supabase
      .from(source.table("players"))
      .select("*")
      .eq("slug", slug)
      .maybeSingle<PlayerRecord>(),
    "player",
  );
  if (!player) return null;

  const id = player.id;
  const matchesTable = source.table("matches");

  const [matchListResult, aiSummaryResult, ownRows, rankHistoryResult] = await Promise.all([
    // Query from matches (not match_participants) so game_creation is a true
    // top-level column — PostgREST's foreignTable order only reorders embedded
    // to-many collections within each parent, so ordering "through"
    // match_participants silently no-ops and returns insertion order instead.
    source.supabase
      .from(matchesTable)
      // riot_match_id is asked for only privately: the demo view drops the
      // column entirely rather than nulling it, so selecting it there is a
      // 42703 rather than a null. That's the right way round — a column that
      // must never be published should be absent, not empty.
      .select(
        `id, ${source.demo ? "" : "riot_match_id, "}game_creation, game_duration_seconds, ${source.table("match_participants")}!inner(player_id)`,
      )
      .eq(`${source.table("match_participants")}.player_id`, id)
      .order("game_creation", { ascending: false })
      .limit(RECENT_FORM_LIMIT)
      .returns<MatchListRow[]>(),
    // Two different tables, not one table behind a view.
    //
    // player_ai_summaries is prose written about a named person from their own
    // match notes and the clan's context, and it regenerates unattended every
    // night. demo_player_summaries is a separate body of text, written in an
    // analyst voice from aliases only, and published by hand from Settings —
    // see lib/summary-analyst.ts. `stale` has no meaning on that side: nothing
    // rewrites it on a schedule, so it is never stale, only old.
    source.demo
      ? source.supabase
          .from("demo_player_summaries")
          .select("summary_text, generated_at")
          .eq("player_id", id)
          .maybeSingle<AiSummaryRow>()
      : source.supabase
          .from("player_ai_summaries")
          .select("summary_text, generated_at, stale")
          .eq("player_id", id)
          .maybeSingle<AiSummaryRow>(),
    fetchAllRows<OwnRow>((from, to) =>
      source.supabase
        .from(source.table("match_participants"))
        .select(`${OWN_ROW_COLUMNS}, ${matchesTable}!inner(game_creation, game_duration_seconds)`)
        .eq("player_id", id)
        .range(from, to)
        .returns<OwnRow[]>(),
    ),
    source.supabase
      .from(source.table("player_rank_history"))
      .select("tier, division, league_points, recorded_at")
      .eq("player_id", id)
      .order("recorded_at", { ascending: true })
      .returns<RankHistoryRow[]>(),
  ]);

  // The embed comes back keyed by whichever table was queried.
  const historyRows: HistoryRow[] = ownRows.map((r) => {
    const embedded = (r as unknown as Record<string, OwnRow["matches"]>)[matchesTable];
    return {
      ...r,
      game_creation: embedded?.game_creation ?? "",
      game_duration_seconds: embedded?.game_duration_seconds ?? 0,
    };
  });

  // Matchups and lane diffs need the *enemy* rows, so they can't come from the
  // query above. Chunked and paged: ten rows per match over a whole history is
  // the query that crosses PostgREST's Max rows soonest, at ~100 games.
  const historyMatchIds = [...new Set(historyRows.map((r) => r.match_id))];
  const allHistoryParticipants = await fetchAllByIds<MatchupInput & LaneDiffInput>(
    historyMatchIds,
    (chunk, from, to) =>
      source.supabase
        .from(source.table("match_participants"))
        .select(ALL_PARTICIPANT_COLUMNS)
        .in("match_id", chunk)
        .range(from, to)
        .returns<(MatchupInput & LaneDiffInput)[]>(),
  );

  return {
    player,
    teamRows,
    matchList: rows(matchListResult, "recent matches"),
    historyRows,
    allHistoryParticipants,
    rankHistory: rows(rankHistoryResult, "rank history"),
    // Optional rather than fatal: this card is an extra on a page that is about
    // the numbers. It also means the demo keeps working between deploying this
    // code and running migration 019 — without it, a view that does not exist
    // yet would 500 every player page rather than hide one paragraph.
    aiSummary: optional<AiSummaryRow | null>(aiSummaryResult, "AI summary", null),
  };
}

export type PlayerProfile = {
  player: PlayerRecord;
  matchList: MatchListRow[];
  historyRows: HistoryRow[];
  allHistoryParticipants: (MatchupInput & LaneDiffInput)[];
  aiSummary: AiSummaryRow | null;
  /** Games played since the summary was written — what the card's "stale" line counts. */
  newGamesSinceSummary: number;

  roleSplit: Map<string, PlayerAgg>;
  topChampions: ChampionAgg[];
  streak: Streak;
  streakLabel: string | null;
  timeStats: HourWeekdayStats;
  lpPoints: LpPoint[];
  matchups: MatchupAgg[];
  worstMatchup: MatchupAgg | null;
  durationBuckets: DurationBucketAgg[];
  survivalPoints: SurvivalPoint[];
  swing: DurationSwing | null;
  sideSplit: SideSplit;
  laneDiff: LaneDiffAgg;
  totalGames: number;
  winRatePct: number;
  /**
   * Every game in scope, in one shape — Riot rows and team picks together.
   *
   * The aggregates below that a team match can honestly answer are folded over
   * this; the ones that need something only Riot records are not, and say so on
   * the page. See lib/unified.ts.
   */
  scopedRows: UnifiedRow[];
  /** "12 soloQ, 4 flex, 6 team" — the sample the mixed numbers came from. */
  sampleLabel: string;
};

/** Pure. Rows in, everything the view renders out. */
export function buildPlayerProfile(data: PlayerProfileRows): PlayerProfile {
  const { player, historyRows, allHistoryParticipants, aiSummary } = data;
  const id = player.id;

  // Riot rows and team picks in one shape. queue_id is what lets a row say
  // which queue it was, now that a scope can hold both.
  const scopedRows: UnifiedRow[] = [
    ...historyRows.map((row) =>
      fromParticipant(row, row.queue_id === QUEUE_FLEX ? "flexq" : "soloq"),
    ),
    ...data.teamRows,
  ];

  // Streaks read the scoped rows, and computeStreak sorts its own input — which
  // matters more here than it did: a team match is dated to a day, not a
  // moment, so mixed history is only day-accurate and an unsorted read would be
  // silently wrong rather than obviously so.
  const streak = computeStreak(scopedRows);

  const lpPoints: LpPoint[] = [];
  for (const point of data.rankHistory) {
    const lp = ladderPoints(point);
    if (lp !== null) lpPoints.push({ t: new Date(point.recorded_at).getTime(), lp });
  }

  // Duration lives on matches, and the ten-row query deliberately doesn't embed
  // it — ten copies of one number per match is a lot of payload. The player's
  // own rows already carry it.
  const durationByMatch = new Map(historyRows.map((r) => [r.match_id, r.game_duration_seconds]));

  const summaryGeneratedAt = aiSummary?.generated_at ?? null;

  // players.wins/losses is the soloQ record specifically — the sync counts it
  // through soloq_participants — so it can only stand in for the total when
  // soloQ is all that is in scope. Anything wider is counted from the rows.
  const soloqOnly = scopedRows.every((row) => row.source === "soloq");
  const totalGames = soloqOnly ? (player.wins ?? 0) + (player.losses ?? 0) : scopedRows.length;
  const wins = soloqOnly ? (player.wins ?? 0) : scopedRows.filter((row) => row.win).length;
  const survivalPoints = winRatePastMinute(historyRows);
  const matchups = matchupsForPlayer(allHistoryParticipants, id);

  return {
    player,
    matchList: data.matchList,
    historyRows,
    allHistoryParticipants,
    aiSummary,
    newGamesSinceSummary: summaryGeneratedAt
      ? historyRows.filter((r) => r.game_creation > summaryGeneratedAt).length
      : historyRows.length,

    scopedRows,
    sampleLabel: describeSample(scopedRows),

    // Role and champions are folded over every source: which lane somebody
    // plays and what they play there is a question a scrim scoreboard answers
    // as well as Riot does.
    roleSplit: aggregateByRole(scopedRows),
    // Same rows as the role split — a unified row already carries every column
    // ChampionStatInput needs, so the champion strip costs no extra query.
    topChampions: topChampionsByPlayer(scopedRows, TOP_CHAMPION_COUNT).get(id) ?? [],
    streak,
    streakLabel: formatStreak(streak),
    // Everything from here down reads historyRows, not scopedRows, and that is
    // the line the page has to be honest about: a team match has no LP, no
    // kickoff time finer than a date, no enemy laner resolved to an account and
    // no reliable duration. Folding it in would not widen these numbers, it
    // would corrupt them.
    timeStats: aggregateByTime(historyRows),
    lpPoints,
    matchups,
    worstMatchup: nemesis(matchups),
    durationBuckets: aggregateByDuration(historyRows),
    survivalPoints,
    swing: durationSwing(survivalPoints),
    sideSplit: aggregateBySide(historyRows),
    laneDiff: laneDiffForPlayer(allHistoryParticipants, id, durationByMatch),
    totalGames,
    winRatePct: totalGames === 0 ? 0 : Math.round((wins / totalGames) * 100),
  };
}
