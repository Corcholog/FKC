// Everything /insights and /demo/insights read, and everything they fold it into.
//
// This is the most expensive read in the app — the whole participant table for
// tracked players, because duos, civil wars, the tilt curve and the heatmap all
// fold over the same rows. On the demo that cost is paid once an hour instead of
// once per visitor, which is the page that justifies the data cache.
//
// Fetch/build split for the reason demo-cache.ts spells out: `fetchInsightsRows`
// returns plain arrays, `buildInsights` returns the Maps and the resolved names.
// Names are resolved *here* rather than in the view, so the view never holds a
// player-id-to-name lookup and can't accidentally render an id.

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { rows } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import { ladderPoints, rankSortKey } from "@/lib/rank";
import {
  aggregateDuoStats,
  duoSynergy,
  duoWinRate,
  MIN_DUO_GAMES,
  type DuoRecord,
} from "@/lib/duo-stats";
import { streaksByPlayer, type Streak } from "@/lib/streaks";
import {
  gameIndexByOwner,
  groupIntoSessions,
  longestSession,
  winRateByGameIndex,
  type GameIndexPoint,
  type Session,
} from "@/lib/sessions";
import {
  aggregateByTime,
  busiestHour,
  lateNightRecord,
  playersByTimeSlot,
  type HourWeekdayStats,
  type TimeBucket,
} from "@/lib/time-stats";
// Type-only, so these stay compile-time shapes with no runtime import of the
// client components that own them.
import type { LpSeries } from "@/components/charts/lp-chart";
import type { RankRow } from "@/components/stat-ranking";
import { MAX_SERIES } from "@/components/charts/chart-theme";

/** Below this a "longest session" is just an evening, not a marathon worth naming. */
export const MIN_MARATHON_GAMES = 3;

export type InsightsPlayer = {
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

export type InsightsRankHistoryRow = {
  player_id: string;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  recorded_at: string;
};

/** One participant row, with the match embed already flattened onto it. */
export type InsightsParticipantRow = {
  match_id: string;
  player_id: string | null;
  team_id: number;
  win: boolean;
  game_creation: string;
  game_duration_seconds: number;
};

export type InsightsRows = {
  players: InsightsPlayer[];
  rankHistory: InsightsRankHistoryRow[];
  participants: InsightsParticipantRow[];
};

type RawParticipantRow = Omit<InsightsParticipantRow, "game_creation" | "game_duration_seconds"> & {
  matches: { game_creation: string; game_duration_seconds: number } | null;
};

export async function fetchInsightsRows(source: DataSource): Promise<InsightsRows> {
  const matchesTable = source.table("matches");

  const [playersResult, rankHistoryResult, participantRows] = await Promise.all([
    source.supabase
      .from(source.table("players"))
      .select("id, slug, display_name, avatar_url, tier, division, league_points, wins, losses")
      .returns<InsightsPlayer[]>(),
    source.supabase
      .from(source.table("player_rank_history"))
      .select("player_id, tier, division, league_points, recorded_at")
      .order("recorded_at", { ascending: true })
      .returns<InsightsRankHistoryRow[]>(),
    // Paged, because a silent Max rows truncation here wouldn't look like an
    // error — it would look like a duo that never played together. See
    // lib/supabase/fetch-all.ts.
    fetchAllRows<RawParticipantRow>((from, to) =>
      source.supabase
        .from(source.table("match_participants"))
        .select(
          `match_id, player_id, team_id, win, ${matchesTable}!inner(game_creation, game_duration_seconds)`,
        )
        .not("player_id", "is", null)
        .range(from, to)
        .returns<RawParticipantRow[]>(),
    ),
  ]);

  // The embed comes back keyed by whichever table was queried.
  const participants: InsightsParticipantRow[] = participantRows.map((r) => {
    const embedded = (r as unknown as Record<string, RawParticipantRow["matches"]>)[matchesTable];
    return {
      match_id: r.match_id,
      player_id: r.player_id,
      team_id: r.team_id,
      win: r.win,
      game_creation: embedded?.game_creation ?? "",
      game_duration_seconds: embedded?.game_duration_seconds ?? 0,
    };
  });

  return {
    players: rows(playersResult, "roster"),
    rankHistory: rows(rankHistoryResult, "rank history"),
    participants,
  };
}

export type DuoHighlight = {
  a: string;
  b: string;
  winRate: number;
  /** Null when either player has no solo games to compare against. */
  synergy: number | null;
};

export type CivilWar = {
  key: string;
  a: string;
  b: string;
  aWins: number;
  bWins: number;
};

export type Marathon = {
  playerName: string;
  games: number;
  wins: number;
};

export type Insights = {
  roster: InsightsPlayer[];
  lpSeries: LpSeries[];
  /** True when the race is drawing fewer lines than there are players. */
  rosterExceedsChart: boolean;
  duos: DuoRecord[];
  bestDuo: DuoHighlight | null;
  /** Null when it would be the same pair as `bestDuo`. */
  worstDuo: DuoHighlight | null;
  civilWars: CivilWar[];
  streakBoard: { player: InsightsPlayer; streak: Streak }[];
  tiltPoints: GameIndexPoint[];
  tiltBreakdown: Record<number, RankRow[]>;
  marathon: Marathon | null;
  timeStats: HourWeekdayStats;
  heatmapBreakdown: Record<string, RankRow[]>;
  peakHour: number | null;
  lateNight: TimeBucket;
  /** The comparison the late-night number only means something against. */
  daytime: TimeBucket;
};

/**
 * Pure. Rows in, everything the view renders out.
 *
 * `basePath` prefixes every link out to a player page — "" privately, "/demo"
 * publicly. It has to be threaded rather than inferred, because these hrefs are
 * built into RankRow objects that travel to client components.
 */
export function buildInsights(data: InsightsRows, basePath = ""): Insights {
  const roster = data.players;
  const rosterByRank = [...roster].sort((a, b) => rankSortKey(a) - rankSortKey(b));
  const playersById = new Map(roster.map((p) => [p.id, p]));
  const nameOf = (id: string) => playersById.get(id)?.display_name ?? "Unknown";

  const flatRows = data.participants;

  // --- LP race ---------------------------------------------------------
  // Capped at the palette's slot count: a seventh line would have to reuse a
  // colour, which makes two players indistinguishable. Best-ranked first, and
  // everyone's full history is on their own player page regardless.
  const chartedPlayers = rosterByRank.slice(0, MAX_SERIES);
  const historyByPlayer = new Map<string, LpSeries>();
  for (const player of chartedPlayers) {
    historyByPlayer.set(player.id, {
      id: player.id,
      name: player.display_name,
      avatarUrl: player.avatar_url,
      slug: player.slug,
      points: [],
    });
  }
  for (const point of data.rankHistory) {
    const series = historyByPlayer.get(point.player_id);
    const lp = ladderPoints(point);
    if (!series || lp === null) continue;
    series.points.push({ t: new Date(point.recorded_at).getTime(), lp });
  }
  const lpSeries = [...historyByPlayer.values()].filter((s) => s.points.length > 0);

  // --- Duos and civil wars ---------------------------------------------
  const duoStats = aggregateDuoStats(flatRows);
  const rankedDuos = duoStats.duos.filter((d) => d.games >= MIN_DUO_GAMES);
  const best = rankedDuos.reduce<DuoRecord | null>(
    (winner, d) => (!winner || duoWinRate(d) > duoWinRate(winner) ? d : winner),
    null,
  );
  const worst = rankedDuos.reduce<DuoRecord | null>(
    (loser, d) => (!loser || duoWinRate(d) < duoWinRate(loser) ? d : loser),
    null,
  );
  const highlight = (record: DuoRecord): DuoHighlight => ({
    a: nameOf(record.a),
    b: nameOf(record.b),
    winRate: duoWinRate(record),
    synergy: duoSynergy(record, duoStats),
  });

  // --- Streaks ----------------------------------------------------------
  const streaks = streaksByPlayer(flatRows);
  const streakBoard = roster
    .map((p) => ({ player: p, streak: streaks.get(p.id) }))
    .filter((entry): entry is { player: InsightsPlayer; streak: Streak } =>
      Boolean(entry.streak && entry.streak.games > 0),
    )
    .sort((a, b) => b.streak.current - a.streak.current);

  // --- Sessions and time ------------------------------------------------
  // Sessions are per player: one roster-wide timeline would splice five
  // people's evenings into a single fictional 30-game marathon.
  const rowsByPlayer = new Map<string, InsightsParticipantRow[]>();
  for (const row of flatRows) {
    if (!row.player_id) continue;
    const list = rowsByPlayer.get(row.player_id) ?? [];
    list.push(row);
    rowsByPlayer.set(row.player_id, list);
  }
  const sessionsByPlayer = new Map<string, Session[]>();
  for (const [playerId, playerRows] of rowsByPlayer) {
    sessionsByPlayer.set(playerId, groupIntoSessions(playerRows));
  }
  const allSessions = [...sessionsByPlayer.values()].flat();
  const longest = longestSession(allSessions);
  const marathonPlayerId = longest
    ? ([...rowsByPlayer.entries()].find(([, list]) =>
        list.some((r) => r.game_creation === longest.games[0].game_creation),
      )?.[0] ?? null)
    : null;

  const timeStats = aggregateByTime(flatRows);
  const lateNight = lateNightRecord(timeStats);

  // --- What each chart cell is hiding -----------------------------------
  // A shaded square and an averaged point are both roster-wide totals, which is
  // exactly the shape of number someone reads and thinks "that isn't me". These
  // hand the charts the players behind each one, for StatRankingDialog.
  const playerRow = (playerId: string, value: string, sub: string): RankRow => {
    const player = playersById.get(playerId);
    return {
      id: playerId,
      name: player?.display_name ?? "Unknown",
      avatarUrl: player?.avatar_url ?? null,
      href: player ? `${basePath}/player/${player.slug}` : undefined,
      value,
      sub,
    };
  };

  const heatmapBreakdown: Record<string, RankRow[]> = {};
  for (const [slot, records] of playersByTimeSlot(flatRows)) {
    heatmapBreakdown[slot] = records.map((r) =>
      playerRow(r.ownerId, `${r.games}g`, `${r.wins}W / ${r.games - r.wins}L`),
    );
  }

  // Ordered by the metric the curve actually plots — winrate — rather than by
  // volume, with the record alongside, since a 100% at game nine is one game.
  const tiltBreakdown: Record<number, RankRow[]> = {};
  for (const [index, records] of gameIndexByOwner(sessionsByPlayer)) {
    tiltBreakdown[index] = [...records]
      .sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)
      .map((r) =>
        playerRow(
          r.ownerId,
          `${Math.round((r.wins / r.games) * 100)}%`,
          `${r.wins}W / ${r.games - r.wins}L`,
        ),
      );
  }

  return {
    roster,
    lpSeries,
    rosterExceedsChart: rosterByRank.length > MAX_SERIES,
    duos: duoStats.duos,
    bestDuo: best ? highlight(best) : null,
    worstDuo: worst && worst !== best ? highlight(worst) : null,
    civilWars: duoStats.civilWars.map((war) => ({
      key: `${war.a}|${war.b}`,
      a: nameOf(war.a),
      b: nameOf(war.b),
      aWins: war.aWins,
      bWins: war.games - war.aWins,
    })),
    streakBoard,
    tiltPoints: winRateByGameIndex(allSessions),
    tiltBreakdown,
    marathon:
      longest && longest.games.length >= MIN_MARATHON_GAMES
        ? {
            playerName: marathonPlayerId ? nameOf(marathonPlayerId) : "Someone",
            games: longest.games.length,
            wins: longest.wins,
          }
        : null,
    timeStats,
    heatmapBreakdown,
    peakHour: busiestHour(timeStats),
    lateNight,
    daytime: {
      games: timeStats.totalGames - lateNight.games,
      wins: timeStats.byHour.reduce((sum, b) => sum + b.wins, 0) - lateNight.wins,
    },
  };
}
