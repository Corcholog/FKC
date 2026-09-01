"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The open/closed shell around a match row.
 *
 * Only this thin wrapper is a client component: MatchRow itself stays on the
 * server because it takes the full champion map, which isn't worth pushing
 * across the RSC boundary once per row. The row's contents arrive as children
 * and the notes UI as `panel`, both rendered on the server.
 *
 * Plain useState rather than a Collapsible primitive — the panel doesn't
 * animate, and matchup-list.tsx already sets that precedent.
 */
export function MatchRowShell({
  win,
  noteCount,
  panel,
  roomy = false,
  children,
}: {
  /**
   * Null means no result belongs to this row and the accent stays neutral.
   * Nothing produces one today — the flex gate in lib/team/roster.ts stopped a
   * game the roster played against itself from ever being stored — but the
   * neutral state is a line of CSS and the alternative is a row that has to
   * claim a loss it can't support.
   */
  win: boolean | null;
  noteCount: number;
  /**
   * More air around a taller row. The team match history draws ten champion
   * portraits per row at up to 48px; the soloQ feed draws six at 32px and would
   * only look loose with the same padding.
   */
  roomy?: boolean;
  /**
   * The notes UI, only mounted while open so a 50-row page isn't 50 live forms.
   *
   * Omitted where there are no notes and no match link to put
   * in a panel. Without one the row renders as a plain div: an expand chevron
   * that opens onto nothing is worse than no chevron.
   */
  panel?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const padding = roomy ? "p-3 @2xl:p-4" : "p-3";

  const shellClass = cn(
    "panel-hex @container border-l-4",
    panel && "is-interactive",
    win === null ? "border-l-border" : win ? "border-l-win" : "border-l-loss",
  );

  if (!panel) {
    return (
      <div className={shellClass}>
        <div className={cn("flex w-full items-center gap-3 text-left", padding)}>
          {children}
          {/* Kept as an empty spacer so rows line up with the interactive
              version if the two ever appear on one page. */}
          <div className="w-11 shrink-0" />
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "flex w-full items-center gap-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          padding,
        )}
      >
        {children}

        {/* Fixed width so the chevron column lines up down the list whether or
            not a row has notes. */}
        <div className="flex w-11 shrink-0 items-center justify-end gap-1">
          {noteCount > 0 && (
            <span className="flex items-center gap-0.5 tabular-nums text-xs text-gold-bright">
              <MessageSquare className="h-3.5 w-3.5" />
              {noteCount}
            </span>
          )}
          <ChevronDown
            className={cn("h-4 w-4 text-grey-mid transition-transform", open && "rotate-180")}
          />
        </div>
      </button>

      {open && (
        <div id={panelId} className={cn("border-t border-border", padding)}>
          {panel}
        </div>
      )}
    </div>
  );
}
