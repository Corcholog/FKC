// Signature "premium" stat element per the visual-overhaul brief — an SVG
// stroke-dasharray progress ring, gold-on-navy, used anywhere a win rate
// would otherwise just be plain text (player header, dashboard, champion
// stat chips).
export function WinrateRing({
  percentage,
  size = 56,
  strokeWidth = 5,
  label,
}: {
  percentage: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const offset = circumference * (1 - clamped / 100);
  const center = size / 2;

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${Math.round(clamped)}% win rate`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="font-heading absolute text-sm font-semibold tabular-nums text-white">
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}
