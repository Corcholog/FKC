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
import type { GameIndexPoint } from "@/lib/sessions";
import { AXIS_TICK, CHART_INK, GRID_STROKE } from "@/components/charts/chart-theme";
import {
  ChartTooltipRow,
  ChartTooltipShell,
  type ChartTooltipProps,
} from "@/components/charts/chart-tooltip";

function TiltTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload as unknown as GameIndexPoint;
  return (
    <ChartTooltipShell title={`Game ${point.index} of a session`}>
      <ChartTooltipRow color={CHART_INK.primary} name="Winrate" value={`${point.winRate}%`} />
      <ChartTooltipRow name="Record" value={`${point.wins}W / ${point.games - point.wins}L`} />
    </ChartTooltipShell>
  );
}

// Winrate against how deep into a queue session the game was. The sample size
// falls off a cliff toward the right — few sessions reach ten games — so the
// caption under the chart has to carry that, not just the line.
export function TiltCurve({ points, height = 220 }: { points: GameIndexPoint[]; height?: number }) {
  if (points.length < 3) {
    return (
      <p className="py-8 text-center text-sm text-grey-mid">
        Not enough sessions yet to see a pattern.
      </p>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
          <ReferenceLine y={50} stroke={CHART_INK.axis} strokeDasharray="4 4" />

          <XAxis
            dataKey="index"
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
            content={<TiltTooltip />}
            cursor={{ stroke: CHART_INK.axis, strokeDasharray: "3 3" }}
            wrapperStyle={{ outline: "none" }}
          />

          <Line
            dataKey="winRate"
            type="monotone"
            stroke={CHART_INK.primary}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 2, stroke: CHART_INK.surface }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: CHART_INK.surface }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
