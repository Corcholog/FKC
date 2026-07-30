"use client";

import { useMemo } from "react";
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
import { formatLadderPoints, formatLadderPointsDetailed, LP_PER_TIER } from "@/lib/rank";
import { AXIS_TICK, CHART_INK, GRID_STROKE, seriesColor } from "@/components/charts/chart-theme";
import {
  ChartTooltipRow,
  ChartTooltipShell,
  type ChartTooltipProps,
} from "@/components/charts/chart-tooltip";

export type LpPoint = {
  /** Epoch ms — a real time axis, so an idle week reads as a gap, not a step. */
  t: number;
  lp: number;
};

export type LpSeries = {
  id: string;
  name: string;
  points: LpPoint[];
};

const DATE_LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const DATE_TIME_LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// One row per distinct timestamp across all series, so a single LineChart can
// draw players whose sync times don't line up. Missing values stay undefined
// and are bridged by connectNulls rather than plotted as zero.
function mergeSeries(series: LpSeries[]) {
  const byTime = new Map<number, Record<string, number>>();

  for (const s of series) {
    for (const point of s.points) {
      const row = byTime.get(point.t) ?? {};
      row[s.id] = point.lp;
      byTime.set(point.t, row);
    }
  }

  return [...byTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, values]) => ({ t, ...values }));
}

// Round out to whole divisions so the axis never ends mid-division, and keep a
// visible band even when someone's LP has barely moved.
function ladderDomain(series: LpSeries[]): [number, number] {
  const all = series.flatMap((s) => s.points.map((p) => p.lp));
  if (all.length === 0) return [0, LP_PER_TIER];

  const min = Math.min(...all);
  const max = Math.max(...all);
  const padded = Math.max(max - min, 100) * 0.15;

  return [Math.floor((min - padded) / 100) * 100, Math.ceil((max + padded) / 100) * 100];
}

function tierBoundaries([min, max]: [number, number]): number[] {
  const lines: number[] = [];
  for (let v = Math.ceil(min / LP_PER_TIER) * LP_PER_TIER; v <= max; v += LP_PER_TIER) {
    lines.push(v);
  }
  return lines;
}

function LpTooltip({ active, payload, label, names }: ChartTooltipProps & { names: Map<string, string> }) {
  if (!active || !payload || payload.length === 0) return null;

  // Rows are merged on exact timestamps, and two players are only ever recorded
  // in the same instant by accident — so most rows hold a value for one series
  // and undefined for the rest. Those have to be dropped rather than formatted:
  // Number(undefined) is NaN, which the formatter reads as "Unranked", which is
  // both wrong and alarming. Highest LP first, since this is a race.
  const rows = payload
    .filter((entry) => Number.isFinite(Number(entry.value)))
    .sort((a, b) => Number(b.value) - Number(a.value));

  if (rows.length === 0) return null;

  return (
    <ChartTooltipShell title={DATE_TIME_LABEL.format(new Date(Number(label)))}>
      {rows.map((entry) => (
        <ChartTooltipRow
          key={String(entry.dataKey)}
          color={entry.color}
          name={names.get(String(entry.dataKey)) ?? String(entry.dataKey)}
          value={formatLadderPointsDetailed(Number(entry.value))}
        />
      ))}
    </ChartTooltipShell>
  );
}

export function LpChart({ series, height = 260 }: { series: LpSeries[]; height?: number }) {
  const data = useMemo(() => mergeSeries(series), [series]);
  const domain = useMemo(() => ladderDomain(series), [series]);
  const boundaries = useMemo(() => tierBoundaries(domain), [domain]);
  const names = useMemo(() => new Map(series.map((s) => [s.id, s.name])), [series]);

  // Two points is the minimum that draws a line rather than a lone dot. Rank
  // history only accumulates one point per sync, so a brand-new tracker sits
  // here for a day or two — say why instead of rendering an empty box.
  const totalPoints = series.reduce((sum, s) => sum + s.points.length, 0);
  if (totalPoints < 2) {
    return (
      <p className="py-8 text-center text-sm text-grey-mid">
        Not enough rank history yet — a point is recorded on each sync.
      </p>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />

          {/* Tier boundaries land on multiples of LP_PER_TIER by construction —
              see ladderPoints in src/lib/rank.ts. */}
          {boundaries.map((value) => (
            <ReferenceLine key={value} y={value} stroke={GRID_STROKE} strokeWidth={1.5} />
          ))}

          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => DATE_LABEL.format(new Date(t))}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: GRID_STROKE }}
            minTickGap={32}
          />
          <YAxis
            domain={domain}
            tickFormatter={formatLadderPoints}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={78}
          />

          <Tooltip
            content={<LpTooltip names={names} />}
            cursor={{ stroke: CHART_INK.axis, strokeDasharray: "3 3" }}
            wrapperStyle={{ outline: "none" }}
          />

          {series.map((s, i) => (
            <Line
              key={s.id}
              dataKey={s.id}
              name={s.name}
              type="monotone"
              stroke={series.length === 1 ? CHART_INK.primary : seriesColor(i)}
              strokeWidth={2}
              // Ring the dots in the surface colour so overlapping players stay
              // readable where two lines cross.
              dot={{ r: 3, strokeWidth: 2, stroke: CHART_INK.surface }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: CHART_INK.surface }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
