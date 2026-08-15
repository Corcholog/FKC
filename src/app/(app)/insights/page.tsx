import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { ladderPoints, rankSortKey, formatWinRate } from "@/lib/rank";
import { aggregateDuoStats, duoSynergy, duoWinRate, MIN_DUO_GAMES } from "@/lib/duo-stats";
import { streaksByPlayer, NOTABLE_STREAK } from "@/lib/streaks";
import {
  gameIndexByOwner,
  groupIntoSessions,
  longestSession,
  winRateByGameIndex,
  type Session,
} from "@/lib/sessions";
import {
  aggregateByTime,
  busiestHour,
  formatHour,
  lateNightRecord,
  playersByTimeSlot,
} from "@/lib/time-stats";
import { LpChart, type LpSeries } from "@/components/charts/lp-chart";
import type { RankRow } from "@/components/stat-ranking";
import { ChartLegend } from "@/components/charts/chart-legend";
import { MAX_SERIES } from "@/components/charts/chart-theme";
import { TiltCurve } from "@/components/charts/tilt-curve";
import { HourHeatmap } from "@/components/charts/hour-heatmap";
import { DuoMatrix } from "@/components/insights/duo-matrix";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionCard } from "@/components/section-card";

type PlayerRow = {
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

type RankHistoryRow = {
  player_id: string;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  recorded_at: string;
};

// Same unbounded-select-then-aggregate-in-JS shape as the dashboard, /team and
// /champions. Fine at this roster's volume; the first page that will need
// Postgres-side aggregation is this one.
type InsightParticipantRow = {
  match_id: string;
  player_id: string | null;
  team_id: number;
  win: boolean;
  matches: { game_creation: string; game_duration_seconds: number } | null;
};

export default async function InsightsPage() {
  const supabase = await createClient();

  const [{ data: players }, { data: rankHistory }, participantRows] = await Promise.all([
    supabase
      .from("players")
      .select("id, slug, display_name, avatar_url, tier, division, league_points, wins, losses")
      .returns<PlayerRow[]>(),
    supabase
      .from("player_rank_history")
      .select("player_id, tier, division, league_points, recorded_at")
      .order("recorded_at", { ascending: true })
      .returns<RankHistoryRow[]>(),
    // The whole participant table for tracked players — duos, civil wars, the
    // tilt curve and the heatmap all fold over it. Paged, because a silent Max
    // rows truncation here wouldn't look like an error, it would look like a
    // duo that never played together. See lib/supabase/fetch-all.ts.
    fetchAllRows<InsightParticipantRow>((from, to) =>
      supabase
        .from("match_participants")
        .select("match_id, player_id, team_id, win, matches!inner(game_creation, game_duration_seconds)")
        .not("player_id", "is", null)
        .range(from, to)
        .returns<InsightParticipantRow[]>(),
    ),
  ]);

  const roster = players ?? [];
  const rosterByRank = [...roster].sort((a, b) => rankSortKey(a) - rankSortKey(b));
  const playersById = new Map(roster.map((p) => [p.id, p]));

  const rows = participantRows.map((r) => ({
    match_id: r.match_id,
    player_id: r.player_id,
    team_id: r.team_id,
    win: r.win,
    game_creation: r.matches?.game_creation ?? "",
    game_duration_seconds: r.matches?.game_duration_seconds ?? 0,
  }));

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
  for (const point of rankHistory ?? []) {
    const series = historyByPlayer.get(point.player_id);
    const lp = ladderPoints(point);
    if (!series || lp === null) continue;
    series.points.push({ t: new Date(point.recorded_at).getTime(), lp });
  }
  const lpSeries = [...historyByPlayer.values()].filter((s) => s.points.length > 0);

  // --- Duos and civil wars ---------------------------------------------
  const duoStats = aggregateDuoStats(rows);
  const rankedDuos = duoStats.duos.filter((d) => d.games >= MIN_DUO_GAMES);
  const bestDuo = rankedDuos.reduce<(typeof rankedDuos)[number] | null>(
    (best, d) => (!best || duoWinRate(d) > duoWinRate(best) ? d : best),
    null,
  );
  const worstDuo = rankedDuos.reduce<(typeof rankedDuos)[number] | null>(
    (worst, d) => (!worst || duoWinRate(d) < duoWinRate(worst) ? d : worst),
    null,
  );

  // --- Streaks ----------------------------------------------------------
  const streaks = streaksByPlayer(rows);
  const streakBoard = roster
    .map((p) => ({ player: p, streak: streaks.get(p.id) }))
    .filter((entry) => entry.streak && entry.streak.games > 0)
    .sort((a, b) => (b.streak?.current ?? 0) - (a.streak?.current ?? 0));

  // --- Sessions and time ------------------------------------------------
  // Sessions are per player: one roster-wide timeline would splice five
  // people's evenings into a single fictional 30-game marathon.
  const rowsByPlayer = new Map<string, typeof rows>();
  for (const row of rows) {
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
  const tiltPoints = winRateByGameIndex(allSessions);
  const marathon = longestSession(allSessions);
  const marathonPlayer = marathon
    ? [...rowsByPlayer.entries()].find(([, list]) =>
        list.some((r) => r.game_creation === marathon.games[0].game_creation),
      )?.[0]
    : null;

  const timeStats = aggregateByTime(rows);
  const lateNight = lateNightRecord(timeStats);
  const peakHour = busiestHour(timeStats);
  // The comparison the late-night number only means something against.
  const daytime = {
    games: timeStats.totalGames - lateNight.games,
    wins: timeStats.byHour.reduce((sum, b) => sum + b.wins, 0) - lateNight.wins,
  };

  const nameOf = (id: string) => playersById.get(id)?.display_name ?? "Unknown";

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
      href: player ? `/player/${player.slug}` : undefined,
      value,
      sub,
    };
  };

  const heatmapBreakdown: Record<string, RankRow[]> = {};
  for (const [slot, records] of playersByTimeSlot(rows)) {
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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Insights</h1>
        <p className="text-sm text-grey-light">
          The stuff you only see once you look at everyone&apos;s games together.
        </p>
      </div>

      <SectionCard
        title="LP race"
        caption={
          rosterByRank.length > MAX_SERIES
            ? `Showing the top ${MAX_SERIES} by rank. Everyone else has their own graph on their player page.`
            : "One point per sync, so a flat line is a day nobody moved."
        }
      >
        <ChartLegend items={lpSeries.map((s) => ({ id: s.id, name: s.name }))} />
        <LpChart series={lpSeries} height={280} endCapAvatars />
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Duo winrates"
          caption={`Winrate when both players are in the same game, on the same team. Pairs with fewer than ${MIN_DUO_GAMES} games are shown but not ranked.`}
        >
          <DuoMatrix players={roster} duos={duoStats.duos} />

          {(bestDuo || worstDuo) && (
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
              {bestDuo && (
                <p className="text-grey-light">
                  Best duo:{" "}
                  <span className="text-white">
                    {nameOf(bestDuo.a)} + {nameOf(bestDuo.b)}
                  </span>{" "}
                  <span className="tabular-nums text-win">{duoWinRate(bestDuo)}%</span>
                  {(() => {
                    const synergy = duoSynergy(bestDuo, duoStats);
                    return synergy === null ? null : (
                      <span className="text-xs text-grey-mid">
                        {" "}
                        ({synergy >= 0 ? "+" : ""}
                        {synergy} vs. solo)
                      </span>
                    );
                  })()}
                </p>
              )}
              {worstDuo && worstDuo !== bestDuo && (
                <p className="text-grey-light">
                  Cursed duo:{" "}
                  <span className="text-white">
                    {nameOf(worstDuo.a)} + {nameOf(worstDuo.b)}
                  </span>{" "}
                  <span className="tabular-nums text-loss">{duoWinRate(worstDuo)}%</span>
                </p>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Civil wars"
          caption="Games where two tracked players ended up on opposite teams. Somebody had to lose."
        >
          {duoStats.civilWars.length === 0 ? (
            <p className="py-6 text-center text-sm text-grey-mid">
              Nobody has been matched against a teammate yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {duoStats.civilWars.map((war) => (
                <li
                  key={`${war.a}|${war.b}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-bg-tertiary px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-white">
                    {nameOf(war.a)} vs {nameOf(war.b)}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium text-gold-bright">
                    {war.aWins} – {war.games - war.aWins}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Tilt curve"
          caption="Winrate by how deep into a queue session the game was. A session ends after a two-hour break. Later games rest on far fewer sessions than early ones."
        >
          <TiltCurve points={tiltPoints} breakdown={tiltBreakdown} />
          {marathon && marathon.games.length >= 3 && (
            <p className="text-sm text-grey-light">
              Longest session:{" "}
              <span className="text-white">
                {marathonPlayer ? nameOf(marathonPlayer) : "Someone"}
              </span>
              , {marathon.games.length} games —{" "}
              <span className="tabular-nums">
                {marathon.wins}W / {marathon.games.length - marathon.wins}L
              </span>
            </p>
          )}
        </SectionCard>

        <SectionCard title="Streaks">
          {streakBoard.length === 0 ? (
            <p className="py-6 text-center text-sm text-grey-mid">No games tracked yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {streakBoard.map(({ player, streak }) => {
                const current = streak?.current ?? 0;
                return (
                  <li key={player.id}>
                    <Link
                      href={`/player/${player.slug}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-tertiary"
                    >
                      <Avatar size="sm">
                        {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
                        <AvatarFallback className="text-[10px]">
                          {player.display_name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-sm text-white">
                        {player.display_name}
                      </span>
                      <span
                        className={`shrink-0 tabular-nums text-sm font-medium ${
                          current >= NOTABLE_STREAK
                            ? "text-win"
                            : -current >= NOTABLE_STREAK
                              ? "text-loss"
                              : "text-grey-light"
                        }`}
                      >
                        {current === 0 ? "—" : `${Math.abs(current)}${current > 0 ? "W" : "L"}`}
                      </span>
                      <span className="w-24 shrink-0 text-right text-xs text-grey-mid">
                        best {streak?.longestWin ?? 0}W / {streak?.longestLoss ?? 0}L
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="When the clan plays">
        <HourHeatmap stats={timeStats} breakdown={heatmapBreakdown} />

        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-sm text-grey-light">
          {peakHour !== null && (
            <span>
              Peak hour: <span className="text-white">{formatHour(peakHour)}</span>
            </span>
          )}
          {lateNight.games > 0 && (
            <span>
              After midnight:{" "}
              <span className="tabular-nums text-white">
                {formatWinRate(lateNight.wins, lateNight.games - lateNight.wins)}
              </span>{" "}
              <span className="text-xs text-grey-mid">
                ({lateNight.games} game{lateNight.games === 1 ? "" : "s"}) vs{" "}
                {formatWinRate(daytime.wins, daytime.games - daytime.wins)} the rest of the day
              </span>
            </span>
          )}
        </div>
      </SectionCard>
    </main>
  );
}
