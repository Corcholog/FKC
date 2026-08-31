import Link from "next/link";
import { formatKdaRatio, formatPerMinute } from "@/lib/format";
import { formatRole } from "@/lib/roles";
import { avatarTint } from "@/lib/avatar-tint";
import { championDisplayName, type ChampionInfo } from "@/lib/ddragon";
import {
  championKdaRatio,
  championWinRate,
  type ChampionAgg,
} from "@/lib/champion-stats";
import {
  csPerMinute,
  damagePerMinute,
  kdaRatio,
  playerWinRate,
  visionScorePerMinute,
  type PlayerAgg,
} from "@/lib/player-stats";
import type { TeamMember } from "@/lib/team/roster";
import {
  PLAYER_SOURCE_LABELS,
  PLAYER_SOURCES,
  type PlayerSource,
} from "@/lib/team/player-source";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChampionIcon } from "@/components/champion-icon";
import { BarRow, winRateTone } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// The team's players in depth — /team/players and its demo.
//
// Two panels: the roster on the left, one player's numbers on the right. The
// roster is the navigation, so both it and the source switch are **links** —
// each combination is a different query and should be linkable, refreshable and
// back-buttonable, which is the same call scope-switch.tsx makes and the reason
// the whole page stays free of client JavaScript.
//
// Every number here comes from the aggregators the rest of the app uses. What
// this page adds is which rows they were handed, which is entirely the source
// switch's doing.

export type TeamPlayerCard = {
  member: TeamMember;
  agg: PlayerAgg | undefined;
  top: ChampionAgg[];
};

function href(basePath: string, slug: string, source: PlayerSource): string {
  const query = source === "all" ? "" : `&source=${source}`;
  return `${basePath}/team/players?player=${slug}${query}`;
}

function RosterRail({
  cards,
  activeSlug,
  source,
  version,
  championMap,
  basePath,
}: {
  cards: TeamPlayerCard[];
  activeSlug: string;
  source: PlayerSource;
  version: string;
  championMap: Map<number, ChampionInfo>;
  basePath: string;
}) {
  return (
    <nav className="flex flex-col gap-2">
      {cards.map(({ member, agg, top }) => {
        const active = member.slug === activeSlug;
        const winRate = agg ? playerWinRate(agg) : 0;

        return (
          <Link
            key={member.id}
            href={href(basePath, member.slug, source)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "panel-hex flex items-center gap-3 p-3 transition-colors",
              active ? "border-gold-muted bg-bg-tertiary/60" : "hover:bg-bg-tertiary/40",
            )}
          >
            <Avatar size="sm">
              {member.avatar_url && <AvatarImage src={member.avatar_url} alt="" />}
              <AvatarFallback style={avatarTint(member.display_name)}>
                {member.display_name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{member.display_name}</p>
              <p className="truncate text-[10px] font-semibold tracking-wider text-grey-mid uppercase">
                {formatRole(member.team_role)}
              </p>
              <div className="mt-1.5 flex gap-1">
                {top.slice(0, 3).map((champion) => (
                  <ChampionIcon
                    key={champion.championId}
                    championId={champion.championId}
                    championName={champion.championName}
                    version={version}
                    championMap={championMap}
                    size="sm"
                  />
                ))}
              </div>
            </div>

            <div className="shrink-0 text-right">
              {agg && agg.games > 0 ? (
                <>
                  <p className={cn("text-sm font-semibold tabular-nums", winRateTone(winRate))}>
                    {winRate}%
                  </p>
                  <p className="text-[10px] tabular-nums text-grey-mid">
                    {agg.games}g · {formatKdaRatio(kdaRatio(agg))}
                  </p>
                </>
              ) : (
                <p className="text-[10px] text-grey-mid">No games</p>
              )}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

function SourceTabs({
  active,
  slug,
  counts,
  basePath,
}: {
  active: PlayerSource;
  slug: string;
  counts: Record<PlayerSource, number>;
  basePath: string;
}) {
  return (
    <nav className="flex flex-wrap gap-1">
      {PLAYER_SOURCES.map((source) => (
        <Link
          key={source}
          href={href(basePath, slug, source)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            source === active
              ? "bg-gold-muted text-white"
              : "text-grey-light hover:bg-bg-tertiary hover:text-white",
          )}
        >
          {PLAYER_SOURCE_LABELS[source]}
          <span className="ml-1.5 tabular-nums opacity-60">{counts[source]}</span>
        </Link>
      ))}
    </nav>
  );
}

/**
 * A summary metric, or a dash.
 *
 * The dash is the point. A team match records no damage and no vision, so a
 * competitive-only pool has no answer for either — and 0 dpm is a claim, where
 * "—" is the absence of one. That distinction is what the null-not-zero rule in
 * unified.ts exists to preserve; printing a zero here would throw it away at the
 * last step.
 */
function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium tracking-wider text-grey-mid uppercase">
        {label}
      </span>
      <span className="font-heading text-lg leading-none font-semibold tabular-nums text-white">
        {value ?? <span className="text-grey-mid">—</span>}
      </span>
    </div>
  );
}

function Summary({ agg }: { agg: PlayerAgg }) {
  return (
    <div className="panel-hex grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
      <Metric label="Win rate" value={`${playerWinRate(agg)}%`} />
      <Metric label="KDA" value={formatKdaRatio(kdaRatio(agg))} />
      <Metric
        label="CS / min"
        value={agg.csDurationSeconds > 0 ? csPerMinute(agg).toFixed(1) : null}
      />
      <Metric
        label="DMG / min"
        value={agg.damageGames > 0 ? Math.round(damagePerMinute(agg)).toLocaleString() : null}
      />
      <Metric label="Games" value={String(agg.games)} />
      <Metric label="Record" value={`${agg.wins}–${agg.games - agg.wins}`} />
      <Metric
        label="Vision / min"
        // detailGames, not games: vision_score is the marker for a row synced
        // with full detail, and a team match has none at all.
        value={agg.detailGames > 0 ? visionScorePerMinute(agg).toFixed(2) : null}
      />
      <Metric label="Deaths / game" value={(agg.deaths / Math.max(agg.games, 1)).toFixed(1)} />
    </div>
  );
}

function ChampionTable({
  pool,
  version,
  championMap,
}: {
  pool: ChampionAgg[];
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  if (pool.length === 0) {
    return <p className="panel-hex p-4 text-sm text-grey-mid">Nothing recorded for this source.</p>;
  }

  const mostPlayed = pool[0].games;

  return (
    <div className="panel-hex overflow-x-auto">
      <table className="w-full min-w-lg text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] tracking-wider text-grey-mid uppercase">
            <th className="px-4 py-2 font-medium">Champion</th>
            <th className="px-4 py-2 text-right font-medium">Games</th>
            <th className="px-4 py-2 text-right font-medium">Record</th>
            <th className="px-4 py-2 text-right font-medium">Win rate</th>
            <th className="px-4 py-2 text-right font-medium">KDA</th>
            <th className="px-4 py-2 text-right font-medium">CS/min</th>
            <th className="px-4 py-2 text-right font-medium">DMG/min</th>
          </tr>
        </thead>
        <tbody>
          {pool.map((champion) => {
            const winRate = championWinRate(champion);
            return (
              <tr key={champion.championId} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-1.5">
                  <BarRow fraction={champion.games / mostPlayed}>
                    <div className="flex items-center gap-2">
                      <ChampionIcon
                        championId={champion.championId}
                        championName={champion.championName}
                        version={version}
                        championMap={championMap}
                        size="sm"
                      />
                      <span className="truncate text-grey-light">
                        {championDisplayName(
                          champion.championId,
                          championMap,
                          champion.championName,
                        )}
                      </span>
                    </div>
                  </BarRow>
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums text-grey-light">
                  {champion.games}
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums text-grey-mid">
                  {champion.wins}–{champion.games - champion.wins}
                </td>
                <td
                  className={cn(
                    "px-4 py-1.5 text-right font-medium tabular-nums",
                    winRateTone(winRate),
                  )}
                >
                  {winRate}%
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums text-grey-light">
                  {formatKdaRatio(championKdaRatio(champion))}
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums text-grey-light">
                  {champion.totalDurationSeconds > 0
                    ? formatPerMinute(champion.totalCs, champion.totalDurationSeconds)
                    : "—"}
                </td>
                {/* Its own clock, not totalDurationSeconds: a pool holding team
                    matches has minutes that recorded no damage, and dividing by
                    those would halve the number while it still rendered. */}
                <td className="px-4 py-1.5 text-right tabular-nums text-grey-light">
                  {champion.damageDurationSeconds > 0
                    ? formatPerMinute(champion.totalDamage, champion.damageDurationSeconds)
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TeamPlayersView({
  cards,
  selected,
  source,
  counts,
  version,
  championMap,
  basePath = "",
}: {
  cards: TeamPlayerCard[];
  selected: TeamPlayerCard;
  source: PlayerSource;
  /** Games per source for the selected player — the numbers beside the tabs. */
  counts: Record<PlayerSource, number>;
  version: string;
  championMap: Map<number, ChampionInfo>;
  basePath?: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <RosterRail
        cards={cards}
        activeSlug={selected.member.slug}
        source={source}
        version={version}
        championMap={championMap}
        basePath={basePath}
      />

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-lg font-semibold text-white">
              {selected.member.display_name}
            </h2>
            <p className="text-xs text-grey-mid">
              {formatRole(selected.member.team_role)} ·{" "}
              {PLAYER_SOURCE_LABELS[source].toLowerCase()}
            </p>
          </div>
          <SourceTabs
            active={source}
            slug={selected.member.slug}
            counts={counts}
            basePath={basePath}
          />
        </div>

        {selected.agg && selected.agg.games > 0 ? (
          <Summary agg={selected.agg} />
        ) : (
          <p className="panel-hex p-4 text-sm text-grey-mid">
            No games recorded for this source yet.
          </p>
        )}

        <ChampionTable pool={selected.top} version={version} championMap={championMap} />
      </div>
    </div>
  );
}
