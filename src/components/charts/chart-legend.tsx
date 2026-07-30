import { seriesColor } from "@/components/charts/chart-theme";

// Rendered as plain HTML next to the chart rather than through Recharts'
// <Legend>, which is awkward to style and re-orders itself with the series.
// Identity is never colour alone — the name is always beside the swatch.
export function ChartLegend({ items }: { items: { id: string; name: string }[] }) {
  if (items.length < 2) return null;

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item, i) => (
        <li key={item.id} className="flex items-center gap-1.5 text-xs text-grey-light">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: seriesColor(i) }}
          />
          {item.name}
        </li>
      ))}
    </ul>
  );
}
