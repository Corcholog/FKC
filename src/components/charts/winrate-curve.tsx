"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MIN_WINRATE_SAMPLE, type WinratePoint } from "@/lib/team/winrate-series";
import { AXIS_TICK, CHART_INK, GRID_STROKE } from "@/components/charts/chart-theme";
import {
  ChartTooltipRow,
  ChartTooltipShell,
  type ChartTooltipProps,
} from "@/components/charts/chart-tooltip";
import { Button } from "@/components/ui/button";
import { winRateTone } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// The team's win rate over time, with a source toggle.
//
// **The toggle is client state, not a link**, and that is the repo's own rule
// (scope-switch.tsx states it): a different *query* is a route, the *same data
// viewed differently* is useState. All three series are computed on the server
// and handed over together, so switching costs no round trip and no spinner —
// which is what makes flicking between them a comparison rather than three page
// loads.

export const WINRATE_SOURCES = ["competitive", "flex", "both"] as const;
export type WinrateSource = (typeof WINRATE_SOURCES)[number];

export const WINRATE_SOURCE_LABELS: Record<WinrateSource, string> = {
  competitive: "Competitive",
  flex: "Flex",
  both: "Both",
};

export type WinrateSeries = Record<WinrateSource, WinratePoint[]>;

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

function WinrateTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as unknown as WinratePoint;

  return (
    <ChartTooltipShell
      title={new Date(point.t).toLocaleDateString(undefined, DATE_FORMAT)}
    >
      <ChartTooltipRow color={CHART_INK.primary} name="Win rate" value={`${point.winRate}%`} />
      <ChartTooltipRow name="Record" value={`${point.wins}W / ${point.games - point.wins}L`} />
      {!point.reliable && <ChartTooltipRow name="Sample" value={`${point.games} games — early`} />}
    </ChartTooltipShell>
  );
}

export function WinrateCurve({
  series,
  height = 220,
}: {
  series: WinrateSeries;
  height?: number;
}) {
  // "Both" is the default because it is the team's record — the two halves are
  // the same five people playing the same game, and the split is the follow-up
  // question rather than the first one.
  const [source, setSource] = useState<WinrateSource>("both");
  const points = series[source];
  const latest = points.at(-1);

  // Only offer a source there are games for. A button that resolves to an empty
  // chart is a dead end, and "Competitive 0" is already said by the record.
  const available = WINRATE_SOURCES.filter((s) => series[s].length > 0);
  const active = available.includes(source) ? source : (available[0] ?? "both");
  const shown = series[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {available.map((option) => (
            <Button
              key={option}
              type="button"
              size="xs"
              variant={option === active ? "default" : "outline"}
              aria-pressed={option === active}
              onClick={() => setSource(option)}
            >
              {WINRATE_SOURCE_LABELS[option]}
            </Button>
          ))}
        </div>
        {latest && (
          <p className="text-xs tabular-nums text-grey-light">
            <span className={cn("font-semibold", winRateTone(shown.at(-1)?.winRate ?? 0))}>
              {shown.at(-1)?.winRate ?? 0}%
            </span>{" "}
            over {shown.length} game{shown.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {shown.length < 2 ? (
        <p className="py-8 text-center text-sm text-grey-mid">
          Not enough games yet to draw a trend.
        </p>
      ) : (
        <>
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={shown} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                {/* The coinflip line. Without it a curve sitting at 47% and one
                    sitting at 53% look identical. */}
                <ReferenceLine y={50} stroke={CHART_INK.axis} strokeDasharray="4 4" />

                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v: number) =>
                    new Date(v).toLocaleDateString(undefined, DATE_FORMAT)
                  }
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: GRID_STROKE }}
                  minTickGap={32}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />

                <Tooltip
                  content={<WinrateTooltip />}
                  cursor={{ stroke: CHART_INK.axis, strokeDasharray: "3 3" }}
                  wrapperStyle={{ outline: "none" }}
                />

                <Line
                  dataKey="winRate"
                  type="monotone"
                  stroke={CHART_INK.primary}
                  strokeWidth={2}
                  // Hollow while the sample is still small, rather than starting
                  // the line later: dropping those points would move the axis
                  // and make a short season look like it began in March.
                  dot={(props) => {
                    const { cx, cy, index } = props as { cx: number; cy: number; index: number };
                    const reliable = shown[index]?.reliable ?? true;
                    return (
                      <circle
                        key={`dot-${index}`}
                        cx={cx}
                        cy={cy}
                        r={reliable ? 3 : 2.5}
                        fill={reliable ? CHART_INK.primary : CHART_INK.surface}
                        stroke={reliable ? CHART_INK.surface : CHART_INK.primary}
                        strokeWidth={reliable ? 2 : 1.5}
                      />
                    );
                  }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: CHART_INK.surface }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-grey-mid">
            Running win rate, so the last point is the record and a rise means the recent games
            beat it. Hollow dots are the first {MIN_WINRATE_SAMPLE} games, where one result still
            moves the line by twenty points.
          </p>
        </>
      )}
    </div>
  );
}
