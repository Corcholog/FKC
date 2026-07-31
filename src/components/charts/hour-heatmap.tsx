"use client";

import { useMemo, useState } from "react";
import {
  WEEKDAY_LABELS,
  bucketWinRate,
  formatHour,
  timeSlotKey,
  type HourWeekdayStats,
} from "@/lib/time-stats";
import { StatRankingDialog, type RankRow } from "@/components/stat-ranking";

// A plain CSS grid rather than a Recharts chart: no charting library has a good
// heatmap primitive, and a grid of divs is both smaller and easier to make
// match the rest of the app.
//
// Colour is sequential (one hue, light to dark) and encodes *volume*, since
// that's the honest thing to encode — a cell with two games has no meaningful
// winrate. Winrate lives in the title text on each cell, where its sample size
// can sit right next to it.
//
// Clicking a cell opens what the shade is hiding: on the clan-wide heatmap,
// which players actually queue in that slot; on a single player's, where that
// slot ranks among all the ones they play.

// Every third hour, so the axis stays readable on a phone.
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

function cellStyle(games: number, max: number) {
  if (games === 0) return { backgroundColor: "#171e28" }; // --color-bg-tertiary

  // Square-root rather than linear: one very heavy session would otherwise
  // flatten every other cell to the same near-empty shade.
  const intensity = Math.sqrt(games / max);
  return {
    backgroundColor: `color-mix(in oklab, #c89b3c ${Math.round(12 + intensity * 88)}%, #10151d)`,
  };
}

function slotLabel(weekday: number, hour: number): string {
  return `${WEEKDAY_LABELS[weekday]} ${formatHour(hour)}`;
}

export function HourHeatmap({
  stats,
  breakdown,
}: {
  stats: HourWeekdayStats;
  /**
   * Cell key (see timeSlotKey) → the players behind that cell, most games
   * first. Supplied on the clan-wide heatmap; omitted on a single player's,
   * where "who played" has one possible answer and the useful comparison is
   * against their own other slots instead.
   */
  breakdown?: Record<string, RankRow[]>;
}) {
  const [openSlot, setOpenSlot] = useState<{ weekday: number; hour: number } | null>(null);

  // Every non-empty cell, busiest first. This is what a click opens when no
  // per-player breakdown was supplied — on one player's heatmap "who played
  // here" has a single answer, so the useful comparison is this slot against
  // their others.
  const slotRanking = useMemo<RankRow[]>(
    () =>
      stats.grid
        .flatMap((row, weekday) => row.map((bucket, hour) => ({ weekday, hour, bucket })))
        .filter((cell) => cell.bucket.games > 0)
        .sort((a, b) => b.bucket.games - a.bucket.games)
        .map((cell) => ({
          id: timeSlotKey(cell.weekday, cell.hour),
          name: slotLabel(cell.weekday, cell.hour),
          value: `${cell.bucket.games}g`,
          sub: `${bucketWinRate(cell.bucket)}% WR`,
        })),
    [stats],
  );

  if (stats.totalGames === 0) {
    return <p className="py-8 text-center text-sm text-grey-mid">No games tracked yet.</p>;
  }

  const max = Math.max(...stats.grid.flat().map((b) => b.games));

  const openKey = openSlot ? timeSlotKey(openSlot.weekday, openSlot.hour) : null;
  const players = openKey ? (breakdown?.[openKey] ?? []) : [];
  const showPlayers = players.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div className="flex min-w-[520px] flex-col gap-1">
          {stats.grid.map((row, weekday) => (
            <div key={WEEKDAY_LABELS[weekday]} className="flex items-center gap-1">
              <span className="w-8 shrink-0 text-[10px] text-grey-mid">
                {WEEKDAY_LABELS[weekday]}
              </span>
              {row.map((bucket, hour) => {
                const winRate = bucketWinRate(bucket);
                const title =
                  bucket.games === 0
                    ? `${slotLabel(weekday, hour)} — no games`
                    : `${slotLabel(weekday, hour)} — ${bucket.games} game${
                        bucket.games === 1 ? "" : "s"
                      }, ${winRate}% WR`;

                // The 2px gap between cells comes from the flex gap above —
                // adjacent fills never touch.
                const className = "h-5 flex-1 rounded-[3px]";
                const style = cellStyle(bucket.games, max);

                // Empty cells stay inert: there is nothing behind them, and 168
                // tab stops for a 7×24 grid would bury the rest of the page.
                if (bucket.games === 0) {
                  return <div key={hour} className={className} style={style} title={title} />;
                }

                return (
                  <button
                    key={hour}
                    type="button"
                    title={title}
                    aria-label={title}
                    aria-haspopup="dialog"
                    onClick={() => setOpenSlot({ weekday, hour })}
                    // A ring rather than a border or outline: box-shadow based,
                    // so a hovered cell doesn't nudge the twenty-three beside it.
                    className={`${className} cursor-pointer hover:ring-1 hover:ring-gold-bright`}
                    style={style}
                  />
                );
              })}
            </div>
          ))}

          <div className="flex items-center gap-1">
            <span className="w-8 shrink-0" />
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} className="flex-1 text-center text-[10px] text-grey-mid">
                {HOUR_TICKS.includes(hour) ? String(hour).padStart(2, "0") : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-grey-mid">
        Shade shows how many games were played, Buenos Aires time. Hover a cell for its record,
        click it for the breakdown.
      </p>

      <StatRankingDialog
        open={openSlot !== null}
        onOpenChange={(open) => !open && setOpenSlot(null)}
        title={openSlot ? slotLabel(openSlot.weekday, openSlot.hour) : ""}
        description={
          showPlayers
            ? "Who played in this slot, most games first."
            : "Every slot played, busiest first — this one is highlighted."
        }
        rows={
          showPlayers
            ? players
            : slotRanking.map((row) => ({ ...row, highlight: row.id === openKey }))
        }
      />
    </div>
  );
}
