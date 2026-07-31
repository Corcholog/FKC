"use client";

import { useId, useMemo, useState } from "react";
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
import { StatRankingDialog, type RankRow } from "@/components/stat-ranking";

export type LpPoint = {
  /** Epoch ms — a real time axis, so an idle week reads as a gap, not a step. */
  t: number;
  lp: number;
};

export type LpSeries = {
  id: string;
  name: string;
  points: LpPoint[];
  /** Only used when the chart is drawing end caps; null falls back to initials. */
  avatarUrl?: string | null;
  /** Makes the player's row in the standings dialog a link through to their page. */
  slug?: string;
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

// Radius of the player's face at the head of their line, and the gap the ring
// around it needs. The chart's right margin is widened by this much so a cap
// sitting on the newest timestamp isn't sliced off by the SVG edge.
const CAP_RADIUS = 10;
const CAP_MARGIN = CAP_RADIUS + 4;

// The bits of Recharts' dot-renderer props this chart reads. Declared
// structurally rather than off DotItemDotProps, which redefines SVG's `points`
// and so isn't assignable to a DotProps-based alias. `payload` is the merged
// row, so it carries the timestamp each series' head is matched on.
type LpDotProps = {
  cx?: number;
  cy?: number;
  payload?: { t?: number };
};

// The marker that replaces the last dot of a line: the player's avatar, clipped
// to a circle and ringed in their series colour so the line it terminates is
// still identifiable at a glance. A missing avatar falls back to initials, the
// same two letters the Avatar component shows.
function AvatarEndCap({
  cx,
  cy,
  color,
  name,
  avatarUrl,
  clipId,
}: {
  cx: number;
  cy: number;
  color: string;
  name: string;
  avatarUrl: string | null;
  clipId: string;
}) {
  const inner = CAP_RADIUS - 1.5;

  return (
    <g>
      {avatarUrl ? (
        <>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={inner} />
          </clipPath>
          {/* Avatars aren't guaranteed square — `slice` crops to fill rather
              than squashing the face into the circle. */}
          <image
            href={avatarUrl}
            x={cx - inner}
            y={cy - inner}
            width={inner * 2}
            height={inner * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      ) : (
        <>
          <circle cx={cx} cy={cy} r={inner} fill={CHART_INK.surface} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9}
            fontWeight={600}
            fill={color}
          >
            {name.slice(0, 2).toUpperCase()}
          </text>
        </>
      )}

      <circle cx={cx} cy={cy} r={inner} fill="none" stroke={color} strokeWidth={2.5} />
      {/* Outer ring in the surface colour, so two players finishing on nearly
          the same LP read as two faces rather than one blob. */}
      <circle cx={cx} cy={cy} r={CAP_RADIUS + 0.75} fill="none" stroke={CHART_INK.surface} strokeWidth={1.5} />
    </g>
  );
}

// The table the race is a picture of: everyone's LP at one instant, highest
// first. LP between syncs is simply the last value recorded, so each player is
// carried forward from their own most recent reading at or before the clicked
// moment — and anyone not yet synced by then is left out rather than plotted at
// zero. The row says which reading it used whenever that isn't the clicked one.
function standingsAt(series: LpSeries[], t: number): RankRow[] {
  const standings: { series: LpSeries; point: LpPoint }[] = [];

  for (const s of series) {
    let latest: LpPoint | null = null;
    for (const point of s.points) {
      if (point.t <= t && (latest === null || point.t > latest.t)) latest = point;
    }
    if (latest) standings.push({ series: s, point: latest });
  }

  return standings
    .sort((a, b) => b.point.lp - a.point.lp)
    .map(({ series: s, point }) => ({
      id: s.id,
      name: s.name,
      avatarUrl: s.avatarUrl ?? null,
      href: s.slug ? `/player/${s.slug}` : undefined,
      value: formatLadderPointsDetailed(point.lp),
      sub: point.t === t ? undefined : `as of ${DATE_TIME_LABEL.format(new Date(point.t))}`,
    }));
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

export function LpChart({
  series,
  height = 260,
  // Off by default: on a single-player chart the face would just label the one
  // line already named above it. /insights turns it on, where the whole point is
  // telling six lines apart.
  endCapAvatars = false,
}: {
  series: LpSeries[];
  height?: number;
  endCapAvatars?: boolean;
}) {
  const data = useMemo(() => mergeSeries(series), [series]);
  const domain = useMemo(() => ladderDomain(series), [series]);
  const boundaries = useMemo(() => tierBoundaries(domain), [domain]);
  const names = useMemo(() => new Map(series.map((s) => [s.id, s.name])), [series]);

  // Epoch ms of the clicked point. Only meaningful with more than one line —
  // a "standings" of one player is just the tooltip again, so the single-player
  // chart on a player page stays a plain chart.
  const [openAt, setOpenAt] = useState<number | null>(null);
  const rankable = series.length > 1;

  // Two LpCharts on one page would otherwise mint the same clipPath ids, and
  // the second chart's avatars would clip against the first one's circles.
  const uid = useId();

  // The head of each line, keyed by timestamp rather than by row index: a
  // series' last reading is whichever of *its* points is newest, which is not
  // the last row of the merged data unless it also synced most recently.
  const lastPointBySeries = useMemo(() => {
    const last = new Map<string, number>();
    for (const s of series) {
      if (s.points.length > 0) {
        last.set(s.id, Math.max(...s.points.map((p) => p.t)));
      }
    }
    return last;
  }, [series]);

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
    <div className="flex flex-col gap-2">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: endCapAvatars ? CAP_MARGIN : 12, bottom: 4, left: 4 }}
            // Recharts snaps activeLabel to the nearest x tick, so anywhere in the
            // plot area resolves to a real recorded instant.
            onClick={
              rankable
                ? (state) => {
                    const t = Number(state.activeLabel);
                    if (Number.isFinite(t)) setOpenAt(t);
                  }
                : undefined
            }
            style={rankable ? { cursor: "pointer" } : undefined}
          >
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

            {series.map((s, i) => {
              const color = series.length === 1 ? CHART_INK.primary : seriesColor(i);
              const lastT = endCapAvatars ? lastPointBySeries.get(s.id) : undefined;

              // Recharts hands these renderers every row of the merged data,
              // including the ones this series has no value for. Those arrive
              // with null coordinates and have to draw nothing — an unguarded
              // <circle> would take the missing cx/cy as 0 and stamp a dot in the
              // chart's top-left corner.
              const marker = (props: LpDotProps, radius: number) => {
                const { cx, cy } = props;
                if (typeof cx !== "number" || typeof cy !== "number") return null;

                if (props.payload?.t === lastT) {
                  return (
                    <AvatarEndCap
                      cx={cx}
                      cy={cy}
                      color={color}
                      name={s.name}
                      avatarUrl={s.avatarUrl ?? null}
                      clipId={`lp-cap-${uid}-${s.id}`}
                    />
                  );
                }

                return (
                  <circle cx={cx} cy={cy} r={radius} fill={color} stroke={CHART_INK.surface} strokeWidth={2} />
                );
              };

              return (
                <Line
                  key={s.id}
                  dataKey={s.id}
                  name={s.name}
                  type="monotone"
                  stroke={color}
                  strokeWidth={2}
                  // Ring the dots in the surface colour so overlapping players
                  // stay readable where two lines cross — except at the head of
                  // the line, which becomes the player's face instead. The face
                  // is drawn at both sizes so hovering it doesn't swap it back
                  // out for a plain dot.
                  dot={(props) => marker(props, 3)}
                  activeDot={(props) => marker(props, 5)}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {rankable && (
        <p className="text-xs text-grey-mid">Click anywhere on the race for the standings at that moment.</p>
      )}

      <StatRankingDialog
        open={openAt !== null}
        onOpenChange={(open) => !open && setOpenAt(null)}
        title={openAt === null ? "" : DATE_TIME_LABEL.format(new Date(openAt))}
        description="Standings at this point in the race, highest LP first."
        rows={openAt === null ? [] : standingsAt(series, openAt)}
        empty="Nobody had been synced yet at this point."
      />
    </div>
  );
}
