import Link from "next/link";
import { championDisplayName, type ChampionInfo } from "@/lib/ddragon";
import { formatWinLoss, formatWinRate } from "@/lib/rank";
import { NOTABLE_STREAK } from "@/lib/streaks";
import { avatarTint } from "@/lib/avatar-tint";
import type { PlayerProfile } from "@/lib/loaders/player";
import { RankBadge } from "@/components/rank-badge";
import { WinrateRing } from "@/components/winrate-ring";
import { LpChart } from "@/components/charts/lp-chart";
import { HourHeatmap } from "@/components/charts/hour-heatmap";
import { DurationCurve } from "@/components/charts/duration-curve";
import { RoleSplit } from "@/components/player/role-split";
import { DurationSplit } from "@/components/player/duration-split";
import { SideSplit } from "@/components/player/side-split";
import { LaneDiffPanel } from "@/components/player/lane-diff-panel";
import { MatchupList } from "@/components/player/matchup-list";
import { TopChampions } from "@/components/player/top-champions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionCard } from "@/components/section-card";

// The player page, minus the two things the private and public versions don't
// share.
//
// Those two are slots rather than flags. `summary` is the AI card, which the
// demo has no counterpart for at all. `recentForm` is the match list, which
// privately carries note threads, an author, and a "can this person write here"
// check derived from the session — none of which exist for an anonymous visitor.
// Passing `session` and `notes` down as optional props would put four
// null-checks inside this component and leave the demo one forgotten branch away
// from rendering somebody's review notes.
//
// Everything else is genuinely identical: the same aggregates over the same
// column names, differing only in which tables they came from.
export function PlayerProfileView({
  profile,
  version,
  championMap,
  basePath = "",
  summary,
  recentForm,
}: {
  profile: PlayerProfile;
  version: string;
  championMap: Map<number, ChampionInfo>;
  /** "" in the private app, "/demo" in the public one. */
  basePath?: string;
  summary?: React.ReactNode;
  recentForm: React.ReactNode;
}) {
  const {
    player,
    streak,
    streakLabel,
    topChampions,
    roleSplit,
    matchups,
    worstMatchup,
    durationBuckets,
    survivalPoints,
    swing,
    sideSplit,
    laneDiff,
    timeStats,
    lpPoints,
    winRatePct,
  } = profile;

  const nemesisName = worstMatchup
    ? championDisplayName(worstMatchup.championId, championMap, worstMatchup.championName)
    : null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Card className="panel-hex panel-hex-clip">
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
            <AvatarFallback className="text-lg" style={avatarTint(player.display_name)}>
              {player.display_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <h1 className="font-heading truncate text-xl font-semibold text-white">
              {player.display_name}
            </h1>
            <p className="truncate text-xs text-grey-light">
              {player.riot_game_name}#{player.riot_tag_line}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RankBadge
                tier={player.tier}
                division={player.division}
                leaguePoints={player.league_points}
              />
              {streakLabel && (
                <Badge
                  variant="outline"
                  className={
                    streak.current >= NOTABLE_STREAK
                      ? "border-win/40 text-win"
                      : "border-loss/40 text-loss"
                  }
                >
                  {streak.current >= NOTABLE_STREAK ? "🔥" : "💀"} {streakLabel}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="tabular-nums font-semibold text-white">
                {formatWinLoss(player.wins, player.losses)}
              </p>
              <p className="tabular-nums text-xs text-grey-light">
                {formatWinRate(player.wins, player.losses)}
              </p>
            </div>
            <WinrateRing percentage={winRatePct} />
          </div>
        </CardContent>
      </Card>

      {summary}

      <SectionCard title="Rank over time">
        <LpChart series={[{ id: player.id, name: player.display_name, points: lpPoints }]} />
      </SectionCard>

      <SectionCard
        title="Top champions"
        action={
          topChampions.length > 0 ? (
            <Link
              href={`${basePath}/champions?player=${player.slug}`}
              className="text-xs text-gold-bright hover:underline"
            >
              View all →
            </Link>
          ) : undefined
        }
      >
        <TopChampions champions={topChampions} version={version} championMap={championMap} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SectionCard title="Roles">
          <RoleSplit byRole={roleSplit} />
        </SectionCard>

        <SectionCard title="Lane matchups">
          {nemesisName && worstMatchup && (
            <p className="text-sm text-grey-light">
              Nemesis: <span className="font-medium text-white">{nemesisName}</span>{" "}
              <span className="tabular-nums text-loss">
                {worstMatchup.wins}W {worstMatchup.games - worstMatchup.wins}L
              </span>
            </p>
          )}
          <MatchupList matchups={matchups} version={version} championMap={championMap} />
        </SectionCard>
      </div>

      <SectionCard
        title="Game length"
        caption={
          swing === null
            ? undefined
            : swing.delta < 0
              ? `Loses ${Math.abs(swing.delta)} points of winrate between ${swing.fromMinute}′ and ${swing.toMinute}′.`
              : `Gains ${swing.delta} points of winrate between ${swing.fromMinute}′ and ${swing.toMinute}′.`
        }
      >
        <DurationCurve points={survivalPoints} />
        <DurationSplit buckets={durationBuckets} />
      </SectionCard>

      <SectionCard title="Versus the lane opponent">
        <LaneDiffPanel agg={laneDiff} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SectionCard title="When they play">
          <HourHeatmap stats={timeStats} />
        </SectionCard>

        <SectionCard title="Map side">
          <SideSplit split={sideSplit} />
        </SectionCard>
      </div>

      {recentForm}
    </main>
  );
}
