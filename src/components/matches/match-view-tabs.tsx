import Link from "next/link";
import { HISTORY_VIEWS, HISTORY_VIEW_LABELS, type HistoryView } from "@/lib/team/history";
import { cn } from "@/lib/utils";

// The filter across the top of /matches.
//
// It offers six things that are not all the same kind of thing, and that is
// deliberate rather than sloppy. Five of them — Everything, Flex, Scrims,
// Friendlies, Officials — filter one stream of **team games**, one row per game.
// The sixth, SoloQ, is a different stream entirely: it is told from a player's
// point of view, so a game two of them queued together is two rows, and it is
// paginated because it is the only view long enough to need it.
//
// They share a control because they answer one question — "what have we played"
// — and separating them into two pages would mean picking which one deserves the
// name /matches. The caption under the tabs is what stops the two counts reading
// as a contradiction.

/** `null` is the soloQ view; a HistoryView is one of the team-game filters. */
export type MatchesView = HistoryView | "soloq";

export const SOLOQ_VIEW = "soloq" as const;

export function MatchViewTabs({
  active,
  counts,
  soloqCount,
}: {
  active: MatchesView;
  /** Over the whole team-game history, not the filtered slice. */
  counts: Record<HistoryView, number>;
  soloqCount: number;
}) {
  // Counts come from the unfiltered stream, and a view with no games is left
  // out entirely rather than offered as an empty one — a team that has never
  // played a friendly should not be asked whether it wants to see them.
  // "Everything" always shows, so there is always a way back.
  const views = HISTORY_VIEWS.filter((view) => view === "all" || counts[view] > 0);

  return (
    <nav className="flex flex-wrap gap-1">
      {views.map((view) => (
        <Tab
          key={view}
          href={view === "all" ? "/matches" : `/matches?view=${view}`}
          label={HISTORY_VIEW_LABELS[view]}
          count={counts[view]}
          active={view === active}
        />
      ))}
      {soloqCount > 0 && (
        <Tab
          href={`/matches?view=${SOLOQ_VIEW}`}
          label="SoloQ"
          count={soloqCount}
          active={active === SOLOQ_VIEW}
          // Set apart, because it is counting something else. Without the rule
          // the two counts sit in one row looking like parts of a total.
          className="ml-1 border-l border-border pl-2"
        />
      )}
    </nav>
  );
}

function Tab({
  href,
  label,
  count,
  active,
  className,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      // Chips, not the underline the prep and settings strips use, and
      // deliberately so: those navigate between pages, this filters the one
      // you're on. Same typographic register as them via .label-nav, different
      // shape, because they aren't the same kind of control.
      className={cn(
        "label-nav px-2.5 py-1 transition-colors",
        active ? "bg-gold-muted text-white" : "text-grey-light hover:bg-bg-tertiary hover:text-white",
        className,
      )}
    >
      {label}
      <span className="ml-1.5 tabular-nums opacity-60">{count}</span>
    </Link>
  );
}
