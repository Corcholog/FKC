import { championDisplayName, type ChampionInfo } from "@/lib/ddragon";
import { formatWinLoss, formatWinRate } from "@/lib/rank";
import { NOTABLE_STREAK } from "@/lib/streaks";
import { avatarTint } from "@/lib/avatar-tint";
import type { PlayerProfile } from "@/lib/loaders/player";
import { allChampionsByPlayer } from "@/lib/champion-stats";
import { aggregatePlayerStats } from "@/lib/player-stats";
import { ChampionPoolTable, SourceSummary } from "@/components/players/champion-pool";
import { RankBadge } from "@/components/rank-badge";
import { WinrateRing } from "@/components/winrate-ring";
import { HourBars } from "@/components/charts/hour-bars";
import { DurationCurve } from "@/components/charts/duration-curve";
import { RoleSplit } from "@/components/player/role-split";
import { DurationSplit } from "@/components/player/duration-split";
import { LaneDiffPanel } from "@/components/player/lane-diff-panel";
import { MatchupList } from "@/components/player/matchup-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionCard } from "@/components/section-card";

// One player, over whichever games the source switch selected.
//
// The page is in two halves and the seam is load-bearing. Above the fold,
// everything folds `profile.scopedRows` — the champion pool, the headline
// numbers, the roles, the streak — and those are honest for a scrim, a flex game
// and a soloQ game alike, because `unified.ts` gives all three one row shape.
// Below it, every panel reads the Riot history only: kickoff time, lane
// matchups, damage and game length are things a hand-entered team match does not
// record, and folding it in would not widen those numbers, it would corrupt
// them. The source caption says so rather than leaving it to be inferred.
//
// This renders once per account, not once per page — the account filter picks
// which copy is in the tree (components/player/account-filter.tsx). Which is why
// recent form is *not* in here: it is a separate five-row query that no account
// filter narrows, so it sits outside the filter on the page, where what changes
// and what doesn't are visibly on opposite sides of the line.
export function PlayerProfileView({
  profile,
  version,
  championMap,
  sourceSwitch,
}: {
  profile: PlayerProfile;
  version: string;
  championMap: Map<number, ChampionInfo>;
  /**
   * Which games this page is counting. A slot rather than a prop the view
   * builds — the switch needs the page's own URL, which this component has no
   * business knowing.
   */
  sourceSwitch?: React.ReactNode;
}) {
  const {
    player,
    streak,
    streakLabel,
    roleSplit,
    matchups,
    worstMatchup,
    durationBuckets,
    survivalPoints,
    swing,
    laneDiff,
    timeStats,
    winRatePct,
    scopedRows,
  } = profile;

  // Folded here rather than in the loader because both are one pass over rows
  // the profile already holds, and neither needs I/O. `scopedRows` is already
  // this player's only — buildPlayerProfile scopes it — so the maps have at most
  // one entry each.
  const sourceAgg = aggregatePlayerStats(scopedRows).get(player.id);
  const pool = allChampionsByPlayer(scopedRows).get(player.id) ?? [];

  const nemesisName = worstMatchup
    ? championDisplayName(worstMatchup.championId, championMap, worstMatchup.championName)
    : null;

  return (
    <div className="flex flex-col gap-6">
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

      {sourceSwitch}

      {sourceAgg && sourceAgg.games > 0 ? (
        <SourceSummary agg={sourceAgg} />
      ) : (
        <p className="panel-hex p-4 text-sm text-grey-mid">
          No games recorded for this source yet.
        </p>
      )}

      <SectionCard
        title="Champion pool"
        caption="Every champion in the selected games. CS and damage carry their own clocks, so a pool holding scrims shows a dash where it has nothing to divide rather than a zero."
      >
        <ChampionPoolTable pool={pool} version={version} championMap={championMap} />
      </SectionCard>

      {/* Everything below reads the Riot history only — see the header. */}
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

      <SectionCard title="When they play">
        <HourBars stats={timeStats} />
      </SectionCard>
    </div>
  );
}
