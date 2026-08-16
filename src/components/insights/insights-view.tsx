import Link from "next/link";
import { formatWinRate } from "@/lib/rank";
import { MIN_DUO_GAMES } from "@/lib/duo-stats";
import { NOTABLE_STREAK } from "@/lib/streaks";
import { formatHour } from "@/lib/time-stats";
import { avatarTint } from "@/lib/avatar-tint";
import type { Insights } from "@/lib/loaders/insights";
import { LpChart } from "@/components/charts/lp-chart";
import { ChartLegend } from "@/components/charts/chart-legend";
import { MAX_SERIES } from "@/components/charts/chart-theme";
import { TiltCurve } from "@/components/charts/tilt-curve";
import { HourHeatmap } from "@/components/charts/hour-heatmap";
import { DuoMatrix } from "@/components/insights/duo-matrix";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionCard } from "@/components/section-card";

// The whole of /insights and /demo/insights.
//
// Unlike the player page there is no slot here: both versions render exactly the
// same sections, because none of them shows anything a demo visitor shouldn't
// see once the names are aliases. `basePath` is the only parameter, and it only
// prefixes links out to player pages.
//
// Every name on this page arrives already resolved by buildInsights — the view
// never holds a player-id lookup, so there is no path by which it could render
// an id, and no second copy of the "Unknown" fallback.
export function InsightsView({ insights, basePath = "" }: { insights: Insights; basePath?: string }) {
  const {
    roster,
    lpSeries,
    rosterExceedsChart,
    duos,
    bestDuo,
    worstDuo,
    civilWars,
    streakBoard,
    tiltPoints,
    tiltBreakdown,
    marathon,
    timeStats,
    heatmapBreakdown,
    peakHour,
    lateNight,
    daytime,
  } = insights;

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
          rosterExceedsChart
            ? `Showing the top ${MAX_SERIES} by rank. Everyone else has their own graph on their player page.`
            : "One point per sync, so a flat line is a day nobody moved."
        }
      >
        <ChartLegend items={lpSeries.map((s) => ({ id: s.id, name: s.name }))} />
        <LpChart series={lpSeries} height={280} endCapAvatars basePath={basePath} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Duo winrates"
          caption={`Winrate when both players are in the same game, on the same team. Pairs with fewer than ${MIN_DUO_GAMES} games are shown but not ranked.`}
        >
          <DuoMatrix players={roster} duos={duos} />

          {(bestDuo || worstDuo) && (
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
              {bestDuo && (
                <p className="text-grey-light">
                  Best duo:{" "}
                  <span className="text-white">
                    {bestDuo.a} + {bestDuo.b}
                  </span>{" "}
                  <span className="tabular-nums text-win">{bestDuo.winRate}%</span>
                  {bestDuo.synergy !== null && (
                    <span className="text-xs text-grey-mid">
                      {" "}
                      ({bestDuo.synergy >= 0 ? "+" : ""}
                      {bestDuo.synergy} vs. solo)
                    </span>
                  )}
                </p>
              )}
              {worstDuo && (
                <p className="text-grey-light">
                  Cursed duo:{" "}
                  <span className="text-white">
                    {worstDuo.a} + {worstDuo.b}
                  </span>{" "}
                  <span className="tabular-nums text-loss">{worstDuo.winRate}%</span>
                </p>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Civil wars"
          caption="Games where two tracked players ended up on opposite teams. Somebody had to lose."
        >
          {civilWars.length === 0 ? (
            <p className="py-6 text-center text-sm text-grey-mid">
              Nobody has been matched against a teammate yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {civilWars.map((war) => (
                <li
                  key={war.key}
                  className="flex items-center justify-between gap-2 rounded-lg bg-bg-tertiary px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-white">
                    {war.a} vs {war.b}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium text-gold-bright">
                    {war.aWins} – {war.bWins}
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
          {marathon && (
            <p className="text-sm text-grey-light">
              Longest session: <span className="text-white">{marathon.playerName}</span>,{" "}
              {marathon.games} games —{" "}
              <span className="tabular-nums">
                {marathon.wins}W / {marathon.games - marathon.wins}L
              </span>
            </p>
          )}
        </SectionCard>

        <SectionCard title="Streaks">
          {streakBoard.length === 0 ? (
            <p className="py-6 text-center text-sm text-grey-mid">No games tracked yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {streakBoard.map(({ player, streak }) => (
                <li key={player.id}>
                  <Link
                    href={`${basePath}/player/${player.slug}`}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-tertiary"
                  >
                    <Avatar size="sm">
                      {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
                      <AvatarFallback
                        className="text-[10px]"
                        style={avatarTint(player.display_name)}
                      >
                        {player.display_name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm text-white">
                      {player.display_name}
                    </span>
                    <span
                      className={`shrink-0 tabular-nums text-sm font-medium ${
                        streak.current >= NOTABLE_STREAK
                          ? "text-win"
                          : -streak.current >= NOTABLE_STREAK
                            ? "text-loss"
                            : "text-grey-light"
                      }`}
                    >
                      {streak.current === 0
                        ? "—"
                        : `${Math.abs(streak.current)}${streak.current > 0 ? "W" : "L"}`}
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs text-grey-mid">
                      best {streak.longestWin}W / {streak.longestLoss}L
                    </span>
                  </Link>
                </li>
              ))}
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
