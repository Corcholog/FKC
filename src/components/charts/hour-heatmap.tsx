import {
  WEEKDAY_LABELS,
  bucketWinRate,
  formatHour,
  type HourWeekdayStats,
} from "@/lib/time-stats";

// A plain CSS grid rather than a Recharts chart: no charting library has a good
// heatmap primitive, and a grid of divs is both smaller and easier to make
// match the rest of the app.
//
// Colour is sequential (one hue, light to dark) and encodes *volume*, since
// that's the honest thing to encode — a cell with two games has no meaningful
// winrate. Winrate lives in the title text on each cell, where its sample size
// can sit right next to it.

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

export function HourHeatmap({ stats }: { stats: HourWeekdayStats }) {
  if (stats.totalGames === 0) {
    return <p className="py-8 text-center text-sm text-grey-mid">No games tracked yet.</p>;
  }

  const max = Math.max(...stats.grid.flat().map((b) => b.games));

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
                return (
                  <div
                    key={hour}
                    // The 2px gap between cells comes from the flex gap above —
                    // adjacent fills never touch.
                    className="h-5 flex-1 rounded-[3px]"
                    style={cellStyle(bucket.games, max)}
                    title={
                      bucket.games === 0
                        ? `${WEEKDAY_LABELS[weekday]} ${formatHour(hour)} — no games`
                        : `${WEEKDAY_LABELS[weekday]} ${formatHour(hour)} — ${bucket.games} game${
                            bucket.games === 1 ? "" : "s"
                          }, ${winRate}% WR`
                    }
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
        Shade shows how many games were played, Buenos Aires time. Hover a cell for its record.
      </p>
    </div>
  );
}
