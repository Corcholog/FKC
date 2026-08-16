import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import type { ChampionInfo } from "@/lib/ddragon";
import type { ScrimNoteThread } from "@/lib/scrims/notes";
import { groupBySeries } from "@/lib/scrims/queries";
import { SCRIM_KIND_LABELS, type ScrimGameView } from "@/lib/scrims/types";
import { ScrimGameCard, type PlayerLookup } from "@/components/scrims/draft-board";
import { MetaChip, SeriesScore } from "@/components/scrims/scrim-ui";

// Every series with every draft — /scrims/history and its demo.
//
// `notesFor` is the slot, same shape as MatchesList's. Returning undefined for a
// game is what tells ScrimGameCard "this surface doesn't do notes", and the demo
// passes no function at all: there is no demo view of scrim_game_notes, so there
// is nothing for the public copy to read even if it asked.
export function ScrimHistoryView({
  games,
  version,
  championMap,
  playerNames,
  basePath = "",
  notesFor,
  currentUserId,
}: {
  games: ScrimGameView[];
  version: string;
  championMap: Map<number, ChampionInfo>;
  playerNames: PlayerLookup;
  basePath?: string;
  notesFor?: (game: ScrimGameView) => ScrimNoteThread[];
  currentUserId?: string | null;
}) {
  const series = groupBySeries(games);

  return (
    <div className="flex flex-col gap-8">
      {series.map((entry) => {
        const wins = entry.games.filter((g) => g.win).length;

        return (
          <section key={entry.series.id} className="flex flex-col gap-3">
            {/* The series header is the anchor for a block of game cards, so it
                carries the identifying facts and the cards carry none of them. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Link
                href={`${basePath}/scrims/${entry.series.id}`}
                className="group flex items-center gap-1.5"
              >
                <span className="font-heading text-lg font-semibold text-white transition-colors group-hover:text-gold-bright">
                  {entry.opponent.name}
                </span>
                <ChevronRight className="h-4 w-4 text-grey-mid transition-colors group-hover:text-gold-bright" />
              </Link>
              <SeriesScore wins={wins} losses={entry.games.length - wins} />
              <MetaChip>{SCRIM_KIND_LABELS[entry.series.kind]}</MetaChip>
              {entry.series.fearless && <MetaChip>Fearless</MetaChip>}
              <span className="ml-auto text-xs text-grey-mid">
                {entry.series.played_on}
                <span className="mx-1 opacity-50">·</span>
                {formatRelativeTime(entry.series.created_at)}
              </span>
            </div>

            {entry.series.notes && (
              <p className="border-l-2 border-border pl-3 text-sm whitespace-pre-wrap text-grey-light">
                {entry.series.notes}
              </p>
            )}

            <div className="flex flex-col gap-3">
              {entry.games.map((game) => (
                <ScrimGameCard
                  key={game.id}
                  game={game}
                  version={version}
                  championMap={championMap}
                  playerNames={playerNames}
                  notes={notesFor?.(game)}
                  currentUserId={currentUserId}
                  basePath={basePath}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
