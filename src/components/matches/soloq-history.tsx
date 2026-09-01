import type { ChampionInfo } from "@/lib/ddragon";
import type { MatchesPage } from "@/lib/loaders/matches";
import type { Session } from "@/lib/auth";
import type { MatchNote } from "@/lib/match-notes";
import { MatchesList } from "@/components/matches-list";
import { MatchesFilter } from "@/components/matches-filter";
import { MatchesPagination } from "@/components/matches-pagination";

// The soloQ view of /matches: one row per player per game, paginated.
//
// Split out of the page because it is the half with a different row shape, a
// different count and a filter of its own — keeping it inline meant a page whose
// two branches shared only their heading.

export function SoloqHistory({
  page,
  pageNumber,
  version,
  championMap,
  notesByParticipantId,
  session,
  accountNames,
}: {
  page: MatchesPage;
  pageNumber: number;
  version: string;
  championMap: Map<number, ChampionInfo>;
  notesByParticipantId: Map<string, MatchNote[]>;
  session: Session | null;
  /** puuid → Riot ID, for anybody with more than one account. */
  accountNames: Map<string, string>;
}) {
  const { players, selectedPlayer, entries, totalMatches, totalPages } = page;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-grey-light">
          {selectedPlayer
            ? `${selectedPlayer.display_name}'s solo queue history.`
            : "Solo queue, every one of us."}
        </p>
        <MatchesFilter players={players} selectedId={selectedPlayer?.slug ?? null} />
      </div>

      <div className="flex flex-col gap-2">
        <MatchesList
          entries={entries}
          version={version}
          championMap={championMap}
          showPlayerName={!selectedPlayer}
          accountNames={accountNames}
          notesFor={({ viewer, player }) => ({
            participantId: viewer.id,
            playerId: viewer.player_id as string,
            ownerName: player?.display_name ?? "This player",
            items: notesByParticipantId.get(viewer.id) ?? [],
            canAdd: session?.player?.id === viewer.player_id,
            currentUserId: session?.user.id ?? null,
          })}
        />
      </div>

      <MatchesPagination
        page={pageNumber}
        totalPages={totalPages}
        totalMatches={totalMatches}
        playerSlug={selectedPlayer?.slug ?? null}
      />
    </div>
  );
}
