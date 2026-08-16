"use client";

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
import { MIN_DURATION_SAMPLE, type SurvivalPoint } from "@/lib/duration-stats";
import { AXIS_TICK, CHART_INK, GRID_STROKE } from "@/components/charts/chart-theme";
import {
  ChartTooltipRow,
  ChartTooltipShell,
  type ChartTooltipProps,
} from "@/components/charts/chart-tooltip";

function DurationTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload as unknown as SurvivalPoint;
  return (
    <ChartTooltipShell title={`Games past ${point.minute} min`}>
      <ChartTooltipRow color={CHART_INK.primary} name="Winrate" value={`${point.winRate}%`} />
      <ChartTooltipRow name="Record" value={`${point.wins}W / ${point.games - point.wins}L`} />
      {!point.reliable && (
        <ChartTooltipRow name="Sample" value={`${point.games} games — too few`} />
      )}
    </ChartTooltipShell>
  );
}

/**
 * Winrate conditional on the game having reached each minute mark.
 *
 * Read left to right it says where a player starts losing control. A line that
 * holds flat is someone whose result doesn't depend on game length; one that
 * slopes down is someone whose team needs to close.
 *
 * The dot changes size on the unreliable points rather than the line breaking or
 * the point being dropped. Dropping them would silently shorten the axis and
 * make a 12-game history look like it ends at 25 minutes; breaking the line
 * reads as missing data rather than thin data. A small hollow dot plus the
 * caption is the honest version — the shape stays visible, the confidence
 * doesn't overstate itself.
 */
export function DurationCurve({
  points,
  height = 200,
}: {
  points: SurvivalPoint[];
  height?: number;
}) {
  if (points.length < 3) {
    return (
      <p className="py-8 text-center text-sm text-grey-mid">
        Not enough games yet to see how length changes the result.
      </p>
    );
  }

  const thin = points.filter((p) => !p.reliable);

  return (
    <div className="flex flex-col gap-2">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
            {/* The coinflip line. Without it a curve sitting at 47% and one
                sitting at 53% look identical. */}
            <ReferenceLine y={50} stroke={CHART_INK.axis} strokeDasharray="4 4" />

            <XAxis
              dataKey="minute"
              tickFormatter={(v) => `${v}'`}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
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
              content={<DurationTooltip />}
              cursor={{ stroke: CHART_INK.axis, strokeDasharray: "3 3" }}
              wrapperStyle={{ outline: "none" }}
            />

            <Line
              dataKey="winRate"
              type="monotone"
              stroke={CHART_INK.primary}
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, index } = props as { cx: number; cy: number; index: number };
                const reliable = points[index]?.reliable ?? true;
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
        Winrate among the games that reached each mark, so every point contains the ones to its
        right. The 15&prime; point is their overall record.
        {thin.length > 0 &&
          ` Hollow dots are under ${MIN_DURATION_SAMPLE} games — shape only, not a number to quote.`}
      </p>
    </div>
  );
}
