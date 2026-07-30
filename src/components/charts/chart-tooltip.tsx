"use client";

import { CHART_INK } from "@/components/charts/chart-theme";

// Recharts passes its own payload shape into a custom tooltip. Typed locally
// rather than imported so a Recharts minor release can't break the build over a
// type name — the runtime shape here has been stable across v2 and v3.
export type TooltipEntry = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

export type ChartTooltipProps = {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: string | number;
};

export function ChartTooltipShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg border border-border px-3 py-2 text-xs shadow-lg"
      style={{ backgroundColor: CHART_INK.surface }}
    >
      <p className="mb-1 font-medium text-white">{title}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

// A swatch carries the series identity; the text stays in the normal ink
// colours so a value never depends on reading a hue.
export function ChartTooltipRow({
  color,
  name,
  value,
}: {
  color?: string;
  name: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {color && (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="flex-1 text-grey-light">{name}</span>
      <span className="tabular-nums font-medium text-white">{value}</span>
    </div>
  );
}
