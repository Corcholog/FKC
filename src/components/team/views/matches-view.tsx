import type { ChampionInfo } from "@/lib/ddragon";
import type { TeamNoteThread } from "@/lib/team/notes";
import { historyRecord, type HistoryEntry } from "@/lib/team/history";
import type { PlayerLookup } from "@/components/team/compare-board";
import { TeamHistoryRow } from "@/components/team/history-row";
import { winRateTone } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// The team-game half of /matches.
//
// One row per game, whatever kind of game it was. That is the whole point of it,
// and it is the one thing the soloQ view on the same page cannot do: that list
// is told from a player's point of view, so a game five of them were in is five
// rows there, correctly. Here the subject is the team, and the team played it
// once.
//
// The filter above it belongs to the page, not to this — it switches between
// this component and the soloQ one, so it cannot live inside either.
//
// `notesFor` is a slot rather than a flag, same shape as MatchesList's.
// Returning undefined for a game is what tells the row "this surface doesn't do
// notes"; a surface that does none passes no function at all.
export function TeamHistoryView({
  entries,
  version,
  championMap,
  playerNames,
  notesFor,
  currentUserId,
}: {
  /** Already filtered, newest first. */
  entries: HistoryEntry[];
  version: string;
  championMap: Map<number, ChampionInfo>;
  playerNames: PlayerLookup;
  notesFor?: (entry: HistoryEntry) => TeamNoteThread[] | undefined;
  currentUserId?: string | null;
}) {
  const record = historyRecord(entries);

  return (
    <div className="flex flex-col gap-4">
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

      {entries.length === 0 ? (
        <p className="text-sm text-grey-mid">Nothing recorded under this filter yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <TeamHistoryRow
              key={`${entry.source}-${entry.id}`}
              entry={entry}
              version={version}
              championMap={championMap}
              playerNames={playerNames}
              notes={notesFor?.(entry)}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
