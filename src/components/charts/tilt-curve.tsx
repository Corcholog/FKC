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
import type { GameIndexPoint } from "@/lib/sessions";
import { AXIS_TICK, CHART_INK, GRID_STROKE } from "@/components/charts/chart-theme";
import {
  ChartTooltipRow,
  ChartTooltipShell,
  type ChartTooltipProps,
} from "@/components/charts/chart-tooltip";
import { StatRankingDialog, type RankRow } from "@/components/stat-ranking";

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
//
// Each point is a clan-wide average, which is exactly the kind of number that
// invites "well, that's not me" — clicking one opens the per-player split
// behind it.
export function TiltCurve({
  points,
  breakdown,
  height = 220,
}: {
  points: GameIndexPoint[];
  /** Session index → each player's record at that depth, best winrate first. */
  breakdown?: Record<number, RankRow[]>;
  height?: number;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (points.length < 3) {
    return (
      <p className="py-8 text-center text-sm text-grey-mid">
        Not enough sessions yet to see a pattern.
      </p>
    );
  }

  const openPoint = points.find((p) => p.index === openIndex) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
            // Handled on the chart rather than on the dots: Recharts snaps to
            // the nearest point, so the whole column is the target instead of a
            // 6px circle. activeLabel is the x value, which is the session index.
            onClick={
              breakdown
                ? (state) => {
                    const index = Number(state.activeLabel);
                    if (Number.isFinite(index)) setOpenIndex(index);
                  }
                : undefined
            }
            style={breakdown ? { cursor: "pointer" } : undefined}
          >
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

      {breakdown && (
        <p className="text-xs text-grey-mid">Click a point for the per-player split.</p>
      )}

      <StatRankingDialog
        open={openPoint !== null}
        onOpenChange={(open) => !open && setOpenIndex(null)}
        title={openPoint ? `Game ${openPoint.index} of a session` : ""}
        description={
          openPoint
            ? `Winrate this deep into a session, per player. Clan-wide: ${openPoint.winRate}% over ${openPoint.games} games.`
            : ""
        }
        rows={openIndex === null ? [] : (breakdown?.[openIndex] ?? [])}
        empty="Nobody has a session this long yet."
      />
    </div>
  );
}
