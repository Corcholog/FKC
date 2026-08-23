// The dashboard — `/` and `/demo`.
//
// The last page that was still a single 760-line file reading Supabase directly.
// Splitting it followed the rule the other loaders here already follow (see
// demo-cache.ts): `fetchDashboardRows` returns plain arrays and can sit behind
// the demo's data cache, `buildDashboard` folds them into the shape the view
// renders and holds no I/O.
//
// What stays out of here is everything the demo has no counterpart for —
// sync_state, the AI recap, match notes, the session. Those are read by the
// private page and handed to the view as slots, so the public version cannot
// render them by forgetting a flag. See docs/engineering/07-frontend.md §14.

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { rows } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import { formatKdaRatio, isoDaysAgo } from "@/lib/format";
import { rankSortKey } from "@/lib/rank";
import {
  groupParticipantsByMatch,
  loadMatchRowParticipants,
  matchComposition,
  type MatchRowParticipant,
} from "@/lib/match-rows";
import type { MatchEntry, MatchesListRow } from "@/lib/loaders/matches";
import {
  aggregateMainRoleStats,
  aggregatePlayerStats,
  csPerMinute,
  damagePerMinute,
  deadTimeShare,
  deathsPerGame,
  kdaRatio,
  minutesSpentDead,
  missingPingsPerGame,
  playerWinRate,
  rankPlayers,
  visionScorePerMinute,
  type PlayerAgg,
  type PlayerStatInput,
  type Ranked,
} from "@/lib/player-stats";
import { streaksByPlayer, type Streak } from "@/lib/streaks";
// Type-only, the same way match-rows.ts imports TeamComposChampion: the tone
// belongs with the dialog that renders it, and a compile-time shape pulls no
// client module into a loader.
import type { RankTone } from "@/components/stat-ranking";

/** Matches read for the activity feed. More than it shows — see `activity`. */
const ACTIVITY_MATCH_LIMIT = 15;
/**
 * Rows rendered. One match that three tracked players were in is three rows, so
 * the fetch above has to over-read for this to fill.
 */
const ACTIVITY_FEED_LIMIT = 10;

/** A superset of `MatchesPlayer`, so these rows can carry the activity feed too. */
export type DashboardPlayer = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  wins: number | null;
  losses: number | null;
};

const PLAYER_COLUMNS =
  "id, slug, display_name, avatar_url, tier, division, league_points, wins, losses";

// game_duration_seconds and game_creation live on matches, so they arrive nested
// and get flattened onto the row before aggregation — same as /team and
// /champions. game_creation is there for the streaks, which have to order a
// player's games and cannot from the participant row alone.
type AwardStatRow = Omit<PlayerStatInput, "game_duration_seconds"> & {
  matches: { game_duration_seconds: number; game_creation: string } | null;
};

/** A participant row with its match's clock and date folded onto it. */
export type DashboardStatRow = PlayerStatInput & { game_creation: string };

export type DashboardRows = {
  players: DashboardPlayer[];
  /** One entry per tracked participation in the last 7 days. Only the count matters. */
  weekPlayerIds: string[];
  matchList: MatchesListRow[];
  /** Every tracked player's whole history. The largest read on the site. */
  statRows: DashboardStatRow[];
  /** All ten participants of each match in `matchList`. */
  participants: MatchRowParticipant[];
};

export async function fetchDashboardRows(source: DataSource): Promise<DashboardRows> {
  const { supabase, demo } = source;
  const matchesTable = source.table("matches");
  const participantsTable = source.table("match_participants");
  const weekAgoIso = isoDaysAgo(7);

  // Independent of each other — run them concurrently instead of paying for a
  // sequential round trip each.
  const [playersResult, weekResult, matchListResult, awardRows] = await Promise.all([
    supabase.from(source.table("players")).select(PLAYER_COLUMNS).returns<DashboardPlayer[]>(),

    supabase
      .from(participantsTable)
      .select(`player_id, ${matchesTable}!inner(game_creation)`)
      .not("player_id", "is", null)
      .gte(`${matchesTable}.game_creation`, weekAgoIso)
      .returns<{ player_id: string }[]>(),

    // Query from matches (true top-level order, proven safe) rather than
    // ordering "through" an embedded match_participants collection.
    //
    // riot_match_id is not selected on the demo: demo_matches drops it, and
    // asking a view for a column it doesn't have is a 42703, not a null.
    supabase
      .from(matchesTable)
      .select(
        `id, ${demo ? "" : "riot_match_id, "}game_creation, game_duration_seconds, ${participantsTable}!inner(player_id)`,
      )
      .not(`${participantsTable}.player_id`, "is", null)
      .order("game_creation", { ascending: false })
      .limit(ACTIVITY_MATCH_LIMIT)
      .returns<MatchesListRow[]>(),

    // Every tracked player's full history, for the award tiles and the streaks.
    // Paged rather than a bare select: this is the whole roster's history in one
    // read, so it's the largest query on the site and the one where a silent
    // Max rows truncation would quietly rewrite who holds every award. Same
    // treatment on /team, /champions and /insights.
    //
    // team_position comes back for two reasons: the performance awards are
    // scoped to each player's main role, and CS/min drops support games — see
    // aggregateMainRoleStats.
    //
    // The columns after damage_dealt_to_champions arrive with migration 005 and
    // are null on anything synced before it — see accumulate, which counts them
    // separately so a half-backfilled history isn't averaged over zeroes.
    fetchAllRows<AwardStatRow>((from, to) =>
      supabase
        .from(participantsTable)
        .select(
          `player_id, team_position, win, kills, deaths, assists, total_cs, damage_dealt_to_champions, vision_score, total_time_spent_dead, penta_kills, objectives_stolen, total_damage_taken, pings, first_blood_kill, ${matchesTable}!inner(game_duration_seconds, game_creation)`,
        )
        .not("player_id", "is", null)
        .range(from, to)
        .returns<AwardStatRow[]>(),
    ),
  ]);

  // The roster is the page: every tile, ranking and match row is keyed by
  // player. A failed read here used to render the whole dashboard blank, which
  // is indistinguishable from a roster nobody has filled in yet.
  const players = rows(playersResult, "roster");
  const weekPlayerIds = rows(weekResult, "this week's games").map((r) => r.player_id);

  // The demo selects no riot_match_id at all, so the key is missing rather than
  // null. Normalising here keeps the cached shape the same on both sides.
  const matchList = rows(matchListResult, "recent matches").map((m) => ({
    ...m,
    riot_match_id: m.riot_match_id ?? null,
  }));

  // The embed comes back under the table's own name, so read it off whichever
  // one was queried rather than hardcoding "matches" — same as loaders/roster.
  const statRows: DashboardStatRow[] = awardRows.map((r) => {
    const embedded = (
      r as unknown as Record<
        string,
        { game_duration_seconds: number; game_creation: string } | null
      >
    )[matchesTable];
    return {
      ...r,
      game_duration_seconds: embedded?.game_duration_seconds ?? 0,
      game_creation: embedded?.game_creation ?? "",
    };
  });

  const participants = await loadMatchRowParticipants(
    source,
    matchList.map((m) => m.id),
  );

  return { players, weekPlayerIds, matchList, statRows, participants };
}

export type AwardSpec = {
  label: string;
  tone: RankTone;
  /** Everyone who qualifies, best-first. The tile shows [0]; the dialog shows all of it. */
  ranking: Ranked<DashboardPlayer>[];
  format: (value: number) => string;
  sub: (games: number) => string;
  /**
   * What the number actually measures, in one line. A tile label like "Ward god"
   * is a joke, not a definition — the standings dialog is where the metric gets
   * stated plainly enough to argue with.
   */
  metric: string;
};

export type Dashboard = {
  /** Best rank first — the squad list. */
  roster: DashboardPlayer[];
  gamesThisWeek: number;
  /** Null when nobody has played at all, rather than a misleading 0%. */
  groupWinRate: number | null;
  mostActive: { player: DashboardPlayer; games: number } | null;
  streaks: Map<string, Streak>;
  hallOfFame: AwardSpec[];
  hallOfShame: AwardSpec[];
  /** One entry per tracked player per recent match, newest first. */
  activity: MatchEntry[];
};

/** Pure. Rows in, everything the view renders out. */
export function buildDashboard(data: DashboardRows): Dashboard {
  const { players, weekPlayerIds, matchList, statRows, participants } = data;

  const playersById = new Map(players.map((p) => [p.id, p]));
  const roster = [...players].sort((a, b) => rankSortKey(a) - rankSortKey(b));

  const totalWins = players.reduce((sum, p) => sum + (p.wins ?? 0), 0);
  const totalLosses = players.reduce((sum, p) => sum + (p.losses ?? 0), 0);
  const totalGames = totalWins + totalLosses;
  const groupWinRate = totalGames === 0 ? null : Math.round((totalWins / totalGames) * 100);

  const weeklyCountByPlayer = new Map<string, number>();
  for (const playerId of weekPlayerIds) {
    weeklyCountByPlayer.set(playerId, (weeklyCountByPlayer.get(playerId) ?? 0) + 1);
  }
  let mostActive: Dashboard["mostActive"] = null;
  for (const [playerId, games] of weeklyCountByPlayer) {
    const player = playersById.get(playerId);
    if (player && games > (mostActive?.games ?? 0)) mostActive = { player, games };
  }

  // Two aggregates, because the tiles below split into two kinds of award.
  //
  // Performance metrics — anything derived from kills, deaths, assists, CS,
  // vision or damage — read `mainRoleStats`, which counts only the role a player
  // actually queues for. An autofilled support carries a CS/min and a vision
  // score from a role they don't play, and folding those in means the tile ranks
  // who got autofilled rather than who farms or wards well.
  //
  // Counting awards — pentakills, steals, first bloods, games, pings, time dead
  // — read `allStats`. Those measure what happened over a career, and a
  // pentakill off-role is still a pentakill; scoping them would just hide games.
  const mainRoleStats = aggregateMainRoleStats(statRows);
  const allStats = aggregatePlayerStats(statRows);
  const streaks = streaksByPlayer(statRows);

  // `qualifier` picks which game counter gates the award, so a metric that only
  // exists on fully-synced rows isn't handed to a player whose history predates
  // migration 005 — see PlayerAgg.detailGames.
  //
  // Returns the whole standings rather than just the winner: the tile shows
  // entry zero and hands the rest to the dialog behind it.
  const ranking = (
    stats: Map<string, PlayerAgg>,
    score: (agg: PlayerAgg) => number,
    direction: "max" | "min",
    qualifier: (agg: PlayerAgg) => number = (agg) => agg.games,
  ) => rankPlayers(players, stats, (p) => p.id, score, qualifier, direction);

  /** A performance stat, over the player's main role only. */
  const award = (
    score: (agg: PlayerAgg) => number,
    direction: "max" | "min",
    qualifier?: (agg: PlayerAgg) => number,
  ) => ranking(mainRoleStats, score, direction, qualifier);

  /** A career counter, over every tracked game whatever role it was played in. */
  const careerAward = (
    score: (agg: PlayerAgg) => number,
    direction: "max" | "min",
    qualifier?: (agg: PlayerAgg) => number,
  ) => ranking(allStats, score, direction, qualifier);

  const csGames = (agg: PlayerAgg) => agg.csGames;
  const detailGames = (agg: PlayerAgg) => agg.detailGames;

  // Sub-text doubles as the honesty check on each tile: with no minimum-games
  // gate, a leader off two games should be visibly a leader off two games.
  const gamesSub = (games: number) => `${games} game${games === 1 ? "" : "s"}`;
  // Says so on the tile, because the two kinds of award sit side by side and
  // otherwise "Best KDA · 12 games" next to "Most games · 40" reads as a bug.
  const mainRoleSub = (games: number) => `${games} main-role game${games === 1 ? "" : "s"}`;
  // Migration 005 columns only exist on games synced since it ran, so these
  // tiles say how many games they're actually built on rather than implying the
  // full history.
  const detailSub = (games: number) => `${gamesSub(games)} with full detail`;
  const mainRoleDetailSub = (games: number) => `${mainRoleSub(games)} with full detail`;

  const oneDecimal = (v: number) => v.toFixed(1);

  /** `detail` reads a migration-005 column, so it only has an answer once that data exists. */
  type GatedSpec = AwardSpec & { detail?: boolean };

  // Whether the roster has any migration-005 data at all. Until the settings
  // backfill has run, the tiles built on it would all be em dashes, so they're
  // dropped from their section rather than padding it out.
  const hasDetailedStats = [...allStats.values()].some((agg) => agg.detailGames > 0);
  const visible = (specs: GatedSpec[]): AwardSpec[] =>
    specs.filter((spec) => hasDetailedStats || !spec.detail);

  const hallOfFame = visible([
    {
      label: "Best KDA",
      tone: "good",
      ranking: award(kdaRatio, "max"),
      format: formatKdaRatio,
      sub: mainRoleSub,
      metric: "(Kills + assists) ÷ deaths, over the player's main role only. Highest first.",
    },
    {
      label: "Best CS/min",
      tone: "good",
      ranking: award(csPerMinute, "max", csGames),
      format: oneDecimal,
      sub: mainRoleSub,
      metric:
        "Creep score per minute in the player's main role. Support mains sit this one out. Highest first.",
    },
    {
      label: "Highest winrate",
      tone: "good",
      ranking: award(playerWinRate, "max"),
      format: (v) => `${v}%`,
      sub: mainRoleSub,
      metric:
        "Main-role games won ÷ main-role games played. No minimum — read the game count beside it. Highest first.",
    },
    {
      label: "Best damage/min",
      tone: "good",
      ranking: award(damagePerMinute, "max"),
      // Four-digit figure in a headline font — a tenth of a damage point is noise.
      format: (v) => Math.round(v).toLocaleString("en-US"),
      sub: mainRoleSub,
      metric: "Damage to champions per minute played, in the player's main role. Highest first.",
    },
    {
      label: "Ward god",
      tone: "good",
      ranking: award(visionScorePerMinute, "max", detailGames),
      // Two decimals, not one: the whole roster lands between roughly 0.5 and
      // 3.0, so a single decimal would tie half of it together.
      format: (v) => v.toFixed(2),
      sub: mainRoleDetailSub,
      metric:
        "Vision score per minute in the player's main role — wards placed, wards killed, time held. A rate, so a long game doesn't win it on its own. Highest first.",
      detail: true,
    },
    {
      label: "Objective thief",
      tone: "good",
      ranking: careerAward((a) => a.objectivesStolen, "max", detailGames),
      format: (v) => String(v),
      sub: detailSub,
      metric: "Dragons, barons and heralds stolen, all-time total across every role. Most first.",
      detail: true,
    },
    {
      label: "Pentakills",
      tone: "good",
      ranking: careerAward((a) => a.pentaKills, "max", detailGames),
      format: (v) => String(v),
      sub: detailSub,
      metric: "Pentakills, all-time total across every role. Most first.",
      detail: true,
    },
    {
      label: "Most first bloods",
      tone: "good",
      ranking: careerAward((a) => a.firstBloods, "max", detailGames),
      format: (v) => String(v),
      sub: detailSub,
      metric: "First blood kills, all-time total across every role. Most first.",
      detail: true,
    },
    {
      // Not a good or a bad stat, just a lot of one — neutral tone keeps it from
      // reading as an achievement it isn't.
      label: "Most games",
      tone: "neutral",
      ranking: careerAward((a) => a.games, "max"),
      format: (v) => String(v),
      sub: gamesSub,
      metric: "Tracked games played, every role included. Most first.",
    },
  ]);

  const hallOfShame = visible([
    {
      label: "Worst KDA",
      tone: "bad",
      ranking: award(kdaRatio, "min"),
      format: formatKdaRatio,
      sub: mainRoleSub,
      metric: "(Kills + assists) ÷ deaths, over the player's main role only. Lowest first.",
    },
    {
      label: "Worst CS/min",
      tone: "bad",
      ranking: award(csPerMinute, "min", csGames),
      format: oneDecimal,
      sub: mainRoleSub,
      metric:
        "Creep score per minute in the player's main role. Support mains sit this one out. Lowest first.",
    },
    {
      label: "Most deaths/game",
      tone: "bad",
      ranking: award(deathsPerGame, "max"),
      format: oneDecimal,
      sub: mainRoleSub,
      metric: "Deaths per game in the player's main role. Most first.",
    },
    {
      label: "Time spent dead",
      tone: "bad",
      ranking: careerAward(minutesSpentDead, "max", detailGames),
      format: (v) => `${Math.round(v)}m`,
      sub: detailSub,
      metric:
        "Total minutes on the grey screen, all-time across every role. Most first — playing more will win this.",
      detail: true,
    },
    {
      // The fair version of the tile beside it — playing the most games would
      // otherwise win the raw total by default.
      label: "% of game dead",
      tone: "bad",
      ranking: careerAward(deadTimeShare, "max", detailGames),
      format: (v) => `${v.toFixed(1)}%`,
      sub: detailSub,
      metric:
        "Share of total game time spent dead, every role included. The version of the tile beside it that game count can't win. Most first.",
      detail: true,
    },
    {
      label: "Most ? pings",
      tone: "neutral",
      ranking: careerAward(missingPingsPerGame, "max", detailGames),
      format: oneDecimal,
      sub: (games) => `per game · ${detailSub(games)}`,
      metric: "Enemy-missing pings per game, every role included. Most first.",
      detail: true,
    },
  ]);

  const participantsByMatch = groupParticipantsByMatch(participants);

  const activity: MatchEntry[] = matchList
    .flatMap((match) => {
      const matchParticipants = participantsByMatch.get(match.id) ?? [];
      // Untracked participants have a null player_id and never get their own row.
      return matchParticipants
        .filter((p) => p.player_id)
        .map((viewer) => ({
          match,
          viewer,
          ...matchComposition(matchParticipants, viewer),
          player: playersById.get(viewer.player_id as string),
        }));
    })
    .slice(0, ACTIVITY_FEED_LIMIT);

  return {
    roster,
    gamesThisWeek: weekPlayerIds.length,
    groupWinRate,
    mostActive,
    streaks,
    hallOfFame,
    hallOfShame,
    activity,
  };
}
