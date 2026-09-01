// Everything one player's page reads, and everything it folds that read into.
//
// Split in two, as every loader here is: `fetchPlayerProfileRows`
// returns plain arrays and is safe to put behind the data cache, while
// `buildPlayerProfile` returns Maps, which do not survive a cache round trip.
// Fetch, then fold — the same separation the rest of the codebase uses between
// pages and lib/*-stats.ts, here forced by the cache rather than by taste.

import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import { maybeRow, rows } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import { aggregateByRole, type PlayerAgg } from "@/lib/player-stats";
import { describeSample, fromParticipant, type UnifiedRow } from "@/lib/unified";
import { QUEUE_FLEX } from "@/lib/queues";
import { computeStreak, formatStreak, type Streak } from "@/lib/streaks";
import { matchupsForPlayer, nemesis, type MatchupAgg, type MatchupInput } from "@/lib/matchups";
import { aggregateByTime, type HourStats } from "@/lib/time-stats";
import {
  aggregateByDuration,
  durationSwing,
  winRatePastMinute,
  type DurationBucketAgg,
  type DurationSwing,
  type SurvivalPoint,
} from "@/lib/duration-stats";
import { laneDiffForPlayer, type LaneDiffAgg, type LaneDiffInput } from "@/lib/lane-diff";

export const RECENT_FORM_LIMIT = 5;

/**
 * The roster row, as wide as the view needs.
 *
 * The page selects `*` and the shape below is what the view actually reads.
 * Named rather than inferred so a column added to `players` cannot quietly
 * change what this module claims to hand over.
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
};

export type MatchListRow = {
  id: string;
  /** See the note on MatchRowData.riotMatchId. */
  riot_match_id: string | null;
  game_creation: string;
  game_duration_seconds: number;
};

type OwnRow = MatchupInput & {
  total_cs: number;
  damage_dealt_to_champions: number;
  queue_id: number;
  /** The account that played it — `player_id` only says who the person is. */
  puuid: string;
  matches: { game_creation: string; game_duration_seconds: number } | null;
};

/** An own row with the embed flattened onto it — what every aggregate takes. */
export type HistoryRow = Omit<OwnRow, "matches"> & {
  game_creation: string;
  game_duration_seconds: number;
};

/**
 * One Riot account, with both of its ranks.
 *
 * The flex columns have been written by the sync since migration 023 — League-V4
 * returns every queue in one response, so they cost no extra call — and nothing
 * has ever rendered them. A team that plays flex on purpose should be able to
 * see the rank it earns there.
 */
export type PlayerAccountRow = {
  puuid: string;
  riot_game_name: string;
  riot_tag_line: string;
  platform: string;
  is_primary: boolean;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  flex_tier: string | null;
  flex_division: string | null;
  flex_league_points: number | null;
};

export type PlayerProfileRows = {
  player: PlayerRecord;
  /** Every account this person owns, primary first. */
  accounts: PlayerAccountRow[];
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
};

// queue_id rides along because a ranked scope holds both queues, and a row
// that cannot say which one it came from cannot be labelled or split.
const ACCOUNT_COLUMNS =
  "puuid, riot_game_name, riot_tag_line, platform, is_primary, tier, division, league_points, " +
  "flex_tier, flex_division, flex_league_points";

// puuid rides along so the page can narrow to one account. A participant row
// carries the account that played it; `player_id` only carries the person.
const OWN_ROW_COLUMNS =
  "match_id, player_id, puuid, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, total_cs, damage_dealt_to_champions, queue_id";

// gold_earned, total_cs and damage_dealt_to_champions ride along for the lane
// differentials: they are the enemy laner's copies of columns the player's own
// rows already carry, and this is the only query that sees the opposing team.
const ALL_PARTICIPANT_COLUMNS =
  "match_id, player_id, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, gold_earned, total_cs, damage_dealt_to_champions";

/** Null when there is genuinely no such player. A failed read throws instead. */
export async function fetchPlayerProfileRows(
  source: DataSource,
  slug: string,
  {
    teamRows = [],
    riotGames = true,
  }: {
    /**
     * Team-match rows to fold in, already scoped to this player by the caller.
     *
     * Passed in rather than fetched here because loading them needs the whole
     * team-match read path (lib/team/queries.ts), and this module deliberately
     * knows only about the Riot tables.
     */
    teamRows?: UnifiedRow[];
    /**
     * False for a source with no Riot records — "competitive" is the only one.
     *
     * A DataSource always names *some* participant view, so without this the
     * competitive page would read flex rows and fold them in while claiming to
     * show scrims. Four reads are skipped rather than issued and discarded; the
     * player row itself is not, because the page still has to render a header
     * and a 404 for an unknown slug.
     */
    riotGames?: boolean;
  } = {},
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

  if (!riotGames) {
    return {
      player,
      accounts: rows(
        await source.supabase
          .from("player_accounts")
          .select(ACCOUNT_COLUMNS)
          .eq("player_id", id)
          .order("is_primary", { ascending: false })
          .order("riot_game_name")
          .returns<PlayerAccountRow[]>(),
        "player accounts",
      ),
      teamRows,
      matchList: [],
      historyRows: [],
      allHistoryParticipants: [],
    };
  }

  const [matchListResult, ownRows, accountsResult] = await Promise.all([
    // Query from matches (not match_participants) so game_creation is a true
    // top-level column — PostgREST's foreignTable order only reorders embedded
    // to-many collections within each parent, so ordering "through"
    // match_participants silently no-ops and returns insertion order instead.
    source.supabase
      .from(matchesTable)
      .select(
        `id, riot_match_id, game_creation, game_duration_seconds, ${source.table("match_participants")}!inner(player_id)`,
      )
      .eq(`${source.table("match_participants")}.player_id`, id)
      .order("game_creation", { ascending: false })
      .limit(RECENT_FORM_LIMIT)
      .returns<MatchListRow[]>(),
    fetchAllRows<OwnRow>((from, to) =>
      source.supabase
        .from(source.table("match_participants"))
        .select(`${OWN_ROW_COLUMNS}, ${matchesTable}!inner(game_creation, game_duration_seconds)`)
        .eq("player_id", id)
        .range(from, to)
        .returns<OwnRow[]>(),
    ),
    source.supabase
      .from("player_accounts")
      .select(ACCOUNT_COLUMNS)
      .eq("player_id", id)
      .order("is_primary", { ascending: false })
      .order("riot_game_name")
      .returns<PlayerAccountRow[]>(),
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
    accounts: rows(accountsResult, "player accounts"),
    teamRows,
    matchList: rows(matchListResult, "recent matches"),
    historyRows,
    allHistoryParticipants,
  };
}

export type PlayerProfile = {
  player: PlayerRecord;
  matchList: MatchListRow[];
  historyRows: HistoryRow[];
  allHistoryParticipants: (MatchupInput & LaneDiffInput)[];

  /**
   * Every account, with its two ranks and how many of the scoped games it
   * played. Counted over the *unfiltered* rows, so the panel can still say what
   * the other accounts hold while the page is narrowed to one.
   */
  accounts: (PlayerAccountRow & { games: number })[];
  /** The puuid the page is narrowed to, or null. */
  accountFilter: string | null;
  roleSplit: Map<string, PlayerAgg>;
  streak: Streak;
  streakLabel: string | null;
  timeStats: HourStats;
  matchups: MatchupAgg[];
  worstMatchup: MatchupAgg | null;
  durationBuckets: DurationBucketAgg[];
  survivalPoints: SurvivalPoint[];
  swing: DurationSwing | null;
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

/**
 * Pure. Rows in, everything the view renders out.
 *
 * Called once per account by the page, plus once for all of them together: the
 * account filter is client state over folds already in hand, not a query, so
 * every narrowing has to be computed here before the page ships (see
 * components/player/account-filter.tsx). Every read is the same array either
 * way — narrowing costs a filter over rows, not a round trip.
 */
export function buildPlayerProfile(
  data: PlayerProfileRows,
  /** One account's puuid, or null for all of them. */
  accountFilter: string | null = null,
): PlayerProfile {
  const { player, allHistoryParticipants } = data;
  const id = player.id;

  // How many of the read rows each account played, before any narrowing — the
  // number beside each row of the accounts panel.
  const gamesByAccount = new Map<string, number>();
  for (const row of data.historyRows) {
    gamesByAccount.set(row.puuid, (gamesByAccount.get(row.puuid) ?? 0) + 1);
  }
  const accounts = data.accounts.map((account) => ({
    ...account,
    games: gamesByAccount.get(account.puuid) ?? 0,
  }));

  // Narrowing happens here, once, so every aggregate below is over the same
  // rows. A team pick carries no puuid — nobody records which account a scrim
  // was played on, and it is the same five people either way — so an account
  // filter drops them rather than keeping rows it cannot attribute. That is why
  // the chips say how many games each account holds: it is the only honest
  // answer to "where did the scrims go".
  const historyRows = accountFilter
    ? data.historyRows.filter((row) => row.puuid === accountFilter)
    : data.historyRows;
  const teamRows = accountFilter ? [] : data.teamRows;

  // Riot rows and team picks in one shape. queue_id is what lets a row say
  // which queue it was, now that a scope can hold both.
  const scopedRows: UnifiedRow[] = [
    ...historyRows.map((row) =>
      fromParticipant(row, row.queue_id === QUEUE_FLEX ? "flexq" : "soloq"),
    ),
    ...teamRows,
  ];

  // Streaks read the scoped rows, and computeStreak sorts its own input — which
  // matters more here than it did: a team match is dated to a day, not a
  // moment, so mixed history is only day-accurate and an unsorted read would be
  // silently wrong rather than obviously so.
  const streak = computeStreak(scopedRows);

  // Duration lives on matches, and the ten-row query deliberately doesn't embed
  // it — ten copies of one number per match is a lot of payload. The player's
  // own rows already carry it.
  const durationByMatch = new Map(historyRows.map((r) => [r.match_id, r.game_duration_seconds]));

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
    scopedRows,
    sampleLabel: describeSample(scopedRows),

    // Role and champions are folded over every source: which lane somebody
    // plays and what they play there is a question a scrim scoreboard answers
    // as well as Riot does.
    roleSplit: aggregateByRole(scopedRows),
    // Same rows as the role split — a unified row already carries every column
    // ChampionStatInput needs, so the champion strip costs no extra query.
    streak,
    streakLabel: formatStreak(streak),
    // Everything from here down reads historyRows, not scopedRows, and that is
    // the line the page has to be honest about: a team match has no kickoff time
    // finer than a date, no enemy laner resolved to an account and no reliable
    // duration. Folding it in would not widen these numbers, it would corrupt
    // them.
    timeStats: aggregateByTime(historyRows),
    accounts,
    accountFilter,
    matchups,
    worstMatchup: nemesis(matchups),
    durationBuckets: aggregateByDuration(historyRows),
    survivalPoints,
    swing: durationSwing(survivalPoints),
    laneDiff: laneDiffForPlayer(allHistoryParticipants, id, durationByMatch),
    totalGames,
    winRatePct: totalGames === 0 ? 0 : Math.round((wins / totalGames) * 100),
  };
}
