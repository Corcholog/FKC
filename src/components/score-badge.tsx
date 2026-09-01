import { cn } from "@/lib/utils";

// The 0-100 performance score, wherever it appears. Shared so the thresholds
// that decide "was that good" are stated once — a match row and a player page
// disagreeing about what 62 means would be worse than either colour choice.

/**
 * Where the bands sit.
 *
 * Not evenly spaced across 0-100, because the score is not evenly distributed
 * across it: the formula compares a player against the nine other people in the
 * lobby, so an ordinary game in an ordinary lobby lands in the high 50s by
 * construction. Bands at 25/50/75 would paint a completely normal game amber
 * and make the whole column look like a warning.
 *
 * 75 is gold rather than green because it is the same band MVP comes out of,
 * and those two marks appearing together should look like one statement.
 */
function tone(score: number): string {
  if (score >= 75) return "bg-gold/15 text-gold-bright";
  if (score >= 62) return "bg-win/15 text-win";
  if (score >= 48) return "bg-bg-tertiary text-grey-light";
  return "bg-loss/15 text-loss";
}

export function ScoreBadge({
  score,
  className,
  title,
}: {
  /**
   * Null renders a dash, and there are two ways to get one: the game predates
   * migration 005 and has no detail columns to score, or it has them and no
   * recompute has run yet. The second is the common one — nothing is scored
   * until the Settings button is pressed — so the tooltip names it first.
   */
  score: number | null;
  className?: string;
  title?: string;
}) {
  if (score === null) {
    return (
      <span
        className={cn("px-1.5 py-0.5 text-[11px] font-bold text-grey-mid", className)}
        title="Not scored yet — run Settings → Sync → Recompute scores. (Games synced before the detailed stats existed can never be scored.)"
      >
        —
      </span>
    );
  }

  return (
    <span
      // Deliberately not .label-micro: that class tracks letters out wide, which
      // is right for a word like "SCRIM" and wrong for a number — "72" renders
      // as two loose digits rather than as one value.
      className={cn("tabular-nums px-1.5 py-0.5 text-[11px] font-bold", tone(score), className)}
      title={title ?? `Performance score: ${score} / 100`}
    >
      {score}
    </span>
  );
}
