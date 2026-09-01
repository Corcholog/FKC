"use client";

import { useMemo, useState } from "react";
import { bucketWinRate, formatHour, type HourStats } from "@/lib/time-stats";
import { StatRankingDialog, type RankRow } from "@/components/stat-ranking";
import { cn } from "@/lib/utils";

// When the team plays, and how that hour goes.
//
// One bar per hour of the day. **Height is games, fill is win rate**, and the
// two carry different weights on purpose: how much you play at 3am is a fact
// about the roster, and how you do at 3am is a claim about it. Height is the
// honest one, so it gets the axis; the win rate is a tint, which is as much
// certainty as twelve games deserves.
//
// It replaced a 24×7 heatmap. That grid had 168 cells over a few hundred games,
// so almost every cell held nothing and the handful that held anything were
// unreadable next to each other — the shape you could actually see was "they
// play in the evening", which is one axis, drawn in two.
//
// Hours with no games render as a floor rather than nothing, so the day keeps
// its shape and a gap reads as a gap.

/** Below this a win rate is noise, so the bar stays neutral rather than lying. */
const MIN_TINT_SAMPLE = 5;

function tintFor(winRate: number | null, games: number): string {
  if (winRate === null || games < MIN_TINT_SAMPLE) return "bg-grey-mid/40";
  if (winRate >= 60) return "bg-win";
  if (winRate >= 52) return "bg-win/60";
  if (winRate <= 40) return "bg-loss";
  if (winRate <= 48) return "bg-loss/60";
  return "bg-grey-light/50";
}

export function HourBars({
  stats,
  breakdown,
}: {
  stats: HourStats;
  /**
   * Hour → the players behind it, most games first. Supplied on the front
   * page's roster-wide chart; omitted on one player's, where "who played" has a
   * single answer.
   */
  breakdown?: Record<number, RankRow[]>;
}) {
  const [openHour, setOpenHour] = useState<number | null>(null);

  const peak = useMemo(
    () => Math.max(1, ...stats.byHour.map((bucket) => bucket.games)),
    [stats],
  );

  if (stats.totalGames === 0) {
    return <p className="py-6 text-center text-sm text-grey-mid">No games tracked yet.</p>;
  }

  const openBucket = openHour === null ? null : stats.byHour[openHour];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-40 items-end gap-[3px]">
        {stats.byHour.map((bucket, hour) => {
          const winRate = bucketWinRate(bucket);
          // A floor of 2% so an empty hour is a visible baseline rather than a
          // hole the eye reads as missing data.
          const height = bucket.games === 0 ? 2 : Math.max(6, (bucket.games / peak) * 100);

          return (
            <button
              key={hour}
              type="button"
              onClick={() => bucket.games > 0 && setOpenHour(hour)}
              disabled={bucket.games === 0}
              aria-label={`${formatHour(hour)} — ${bucket.games} games${
                winRate === null ? "" : `, ${winRate}%`
              }`}
              title={`${formatHour(hour)} · ${bucket.games} game${
                bucket.games === 1 ? "" : "s"
              }${winRate === null ? "" : ` · ${bucket.wins}W-${bucket.games - bucket.wins}L (${winRate}%)`}`}
              className="group flex min-w-0 flex-1 flex-col justify-end self-stretch rounded-sm disabled:cursor-default"
            >
              <span
                className={cn(
                  "w-full rounded-sm transition-[height,filter]",
                  tintFor(winRate, bucket.games),
                  bucket.games > 0 && "group-hover:brightness-125",
                )}
                style={{ height: `${height}%` }}
              />
            </button>
          );
        })}
      </div>

      {/* Every third hour, so the labels don't collide at 24 bars wide. */}
      <div className="flex gap-[3px] text-[9px] tabular-nums text-grey-mid">
        {stats.byHour.map((_, hour) => (
          <span key={hour} className="min-w-0 flex-1 text-center">
            {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-grey-mid">
        <span>Bar height: games played.</span>
        <span className="flex items-center gap-1">
          Fill:
          <span className="inline-block h-2 w-3 rounded-sm bg-loss" /> under 40%
          <span className="inline-block h-2 w-3 rounded-sm bg-grey-light/50" /> even
          <span className="inline-block h-2 w-3 rounded-sm bg-win" /> over 60%
        </span>
        <span>Under {MIN_TINT_SAMPLE} games stays grey.</span>
      </div>

      <StatRankingDialog
        open={openHour !== null}
        onOpenChange={(next) => !next && setOpenHour(null)}
        title={openHour === null ? "" : formatHour(openHour)}
        description={
          openBucket
            ? `Who plays at this hour, most games first. ${openBucket.games} game${
                openBucket.games === 1 ? "" : "s"
              } — ${openBucket.wins}W / ${openBucket.games - openBucket.wins}L.`
            : ""
        }
        rows={openHour === null ? [] : (breakdown?.[openHour] ?? [])}
      />
    </div>
  );
}
