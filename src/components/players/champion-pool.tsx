"use client";

import { useState } from "react";
import { formatKdaRatio, formatPerMinute } from "@/lib/format";
import { championDisplayName, type ChampionInfo } from "@/lib/ddragon";
import { championKdaRatio, championWinRate, type ChampionAgg } from "@/lib/champion-stats";
import {
  averagePerformanceScore,
  csPerMinute,
  damagePerMinute,
  kdaRatio,
  playerWinRate,
  visionScorePerMinute,
  type PlayerAgg,
} from "@/lib/player-stats";
import { ChampionIcon } from "@/components/champion-icon";
import { BarRow, winRateTone } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// One player's pool and headline numbers, over whichever games the source
// switch selected.
//
// A client component for one reason: the pool opens. Five rows is what somebody
// actually plays and the rest is the long tail of one-offs, so the table shows
// five and offers the rest — a page that opens on thirty champions makes
// everything under it unreachable without scrolling past a list nobody reads.
//
// These are the two panels that make a player page answer the same question for
// a scrim as for a soloQ game. Nothing here knows where a row came from: a
// `UnifiedRow` is structurally both a `ChampionStatInput` and a
// `PlayerStatInput` (ADR-046), so `allChampionsByPlayer` and
// `aggregatePlayerStats` fold all three records unchanged and this renders the
// result.

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

export function SourceSummary({ agg }: { agg: PlayerAgg }) {
  return (
    // Three across rather than four: the performance score makes nine tiles, and
    // 3x3 sits better than two full rows and a stranded ninth.
    <div className="panel-hex grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
      <Metric
        label="Avg score"
        // scoredGames, not games: a history that is half pre-backfill would
        // otherwise average real scores against nothing and read far too low.
        // Team matches never score at all, so on a scrim-only source this is a
        // dash — the same answer CS/min and vision give there.
        value={agg.scoredGames > 0 ? averagePerformanceScore(agg).toFixed(1) : null}
      />
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

/** How many champions the pool shows before it has to be asked for the rest. */
export const POOL_PREVIEW = 5;

export function ChampionPoolTable({
  pool,
  version,
  championMap,
}: {
  pool: ChampionAgg[];
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (pool.length === 0) {
    return <p className="panel-hex p-4 text-sm text-grey-mid">Nothing recorded for this source.</p>;
  }

  // Scaled against the whole pool, not the visible slice, so the bars don't
  // rescale under the reader when the rest of the table opens.
  const mostPlayed = pool[0].games;
  const shown = expanded ? pool : pool.slice(0, POOL_PREVIEW);
  const hidden = pool.length - shown.length;

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
          {shown.map((champion) => {
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

      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full border-t border-border px-4 py-2 text-xs font-medium text-grey-light transition-colors hover:bg-bg-tertiary hover:text-white"
        >
          {expanded
            ? `Show the top ${POOL_PREVIEW}`
            : `Show all ${pool.length} champions (${hidden} more)`}
        </button>
      )}
    </div>
  );
}
