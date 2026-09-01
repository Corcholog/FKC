import type { TeamSide } from "@/lib/team/types";
import { cn } from "@/lib/utils";

// Small shared display pieces. Server components — none of them are
// interactive, and several render a few hundred times on the drafts page.

/**
 * Blue/red side. Coloured literally, because that's the one place in League
 * where "blue" and "red" name a thing rather than describe it — a red-side game
 * you won still gets a red badge and a green Win, and nobody misreads it.
 */
export function SideBadge({ side, className }: { side: TeamSide; className?: string }) {
  return (
    <span
      className={cn(
        "label-micro px-1.5 py-0.5",
        side === "blue" ? "bg-cyan/15 text-cyan" : "bg-loss/15 text-loss",
        className,
      )}
    >
      {side} side
    </span>
  );
}

export function ResultBadge({ win, className }: { win: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "label-micro px-1.5 py-0.5",
        win ? "bg-win/15 text-win" : "bg-loss/15 text-loss",
        className,
      )}
    >
      {win ? "Win" : "Loss"}
    </span>
  );
}

/** Neutral chip for series type, fearless, patch — anything with no own colour. */
export function MetaChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn("label-micro bg-bg-tertiary px-1.5 py-0.5 text-grey-light", className)}
    >
      {children}
    </span>
  );
}

/**
 * A series result, coloured by who won it. Rendered big because on the history
 * page it's the number the eye should land on first.
 */
export function SeriesScore({
  wins,
  losses,
  className,
}: {
  wins: number;
  losses: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-heading text-base font-semibold tabular-nums",
        wins > losses ? "text-win" : wins < losses ? "text-loss" : "text-grey-light",
        className,
      )}
    >
      {wins}<span className="text-grey-mid">–</span>{losses}
    </span>
  );
}

/**
 * A list row with its own value drawn as a fill behind it.
 *
 * Ranked lists of champions are much faster to read when the shape of the
 * distribution is visible — "these three, then a long tail" lands before any
 * number does. The bar sits *behind* the content rather than beside it so it
 * costs no horizontal space, which matters in a two-column grid.
 */
export function BarRow({
  fraction,
  tone = "gold",
  children,
  className,
}: {
  /** 0-1. Clamped, so a bad denominator can't paint outside the row. */
  fraction: number;
  tone?: "gold" | "loss" | "cyan";
  children: React.ReactNode;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100;
  const fill =
    tone === "loss" ? "bg-loss/15" : tone === "cyan" ? "bg-cyan/15" : "bg-gold/15";

  return (
    <div className={cn("relative isolate overflow-hidden rounded-sm px-1.5 py-1", className)}>
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 -z-10 rounded-sm transition-[width]", fill)}
        style={{ width: `${pct}%` }}
      />
      {children}
    </div>
  );
}

/** Win rate in the app's win/loss colours, neutral in the middle. */
export function winRateTone(winRate: number): string {
  if (winRate >= 60) return "text-win";
  if (winRate <= 40) return "text-loss";
  return "text-grey-light";
}
