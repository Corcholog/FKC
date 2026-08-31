import Link from "next/link";
import type { ChampionInfo } from "@/lib/ddragon";
import type { TeamNoteThread } from "@/lib/team/notes";
import {
  HISTORY_VIEWS,
  HISTORY_VIEW_LABELS,
  historyRecord,
  type HistoryEntry,
  type HistoryView,
} from "@/lib/team/history";
import type { PlayerLookup } from "@/components/team/compare-board";
import { TeamHistoryRow } from "@/components/team/history-row";
import { winRateTone } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// The team's match history — /team/matches and its demo.
//
// One row per game, whatever kind of game it was. That is the whole point of
// the page and it is the one thing the squad-wide soloQ feed at /matches
// cannot do: that list is told from a player's point of view, so a game five
// tracked players were in is five rows there, correctly. Here the subject is
// the team, and the team played it once.
//
// `notesFor` is a slot rather than a flag, same shape as MatchesList's.
// Returning undefined for a game is what tells the row "this surface doesn't do
// notes", and the demo passes no function at all: there is no demo view of
// team_game_notes, so there is nothing for the public copy to read even if it
// asked.

function ViewTabs({
  active,
  counts,
  basePath,
}: {
  active: HistoryView;
  counts: Record<HistoryView, number>;
  basePath: string;
}) {
  // Counts come from the unfiltered stream, and a view with no games is left
  // out entirely rather than offered as an empty one — a roster that has never
  // played a friendly should not be asked whether it wants to see them. "All"
  // always shows, so there is always a way back.
  const views = HISTORY_VIEWS.filter((view) => view === "all" || counts[view] > 0);
  if (views.length <= 2) return null;

  return (
    <nav className="flex flex-wrap gap-1">
      {views.map((view) => {
        const isActive = view === active;
        return (
          <Link
            key={view}
            // The default drops the parameter rather than spelling it out, so
            // the plain URL stays the canonical one.
            href={view === "all" ? `${basePath}/team/matches` : `${basePath}/team/matches?view=${view}`}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-gold-muted text-white"
                : "text-grey-light hover:bg-bg-tertiary hover:text-white",
            )}
          >
            {HISTORY_VIEW_LABELS[view]}
            <span className="ml-1.5 tabular-nums opacity-60">{counts[view]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function TeamHistoryView({
  entries,
  counts,
  view,
  version,
  championMap,
  playerNames,
  basePath = "",
  notesFor,
  currentUserId,
}: {
  /** Already filtered to `view`, newest first. */
  entries: HistoryEntry[];
  /** Over the whole history, not the filtered slice — see ViewTabs. */
  counts: Record<HistoryView, number>;
  view: HistoryView;
  version: string;
  championMap: Map<number, ChampionInfo>;
  playerNames: PlayerLookup;
  basePath?: string;
  notesFor?: (entry: HistoryEntry) => TeamNoteThread[] | undefined;
  currentUserId?: string | null;
}) {
  const record = historyRecord(entries);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewTabs active={view} counts={counts} basePath={basePath} />
        <p className="text-xs tabular-nums text-grey-light">
          {record.games === 0 ? (
            <span className="text-grey-mid">No games</span>
          ) : (
            <>
              {record.wins}–{record.losses}
              <span className={cn("ml-1.5", winRateTone(record.winRate))}>{record.winRate}%</span>
            </>
          )}
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-grey-mid">
          Nothing recorded under this filter yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <TeamHistoryRow
              key={`${entry.source}-${entry.id}`}
              entry={entry}
              version={version}
              championMap={championMap}
              playerNames={playerNames}
              basePath={basePath}
              notes={notesFor?.(entry)}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
