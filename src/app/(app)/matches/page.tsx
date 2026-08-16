import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { notesByParticipant } from "@/lib/match-notes";
import { privateSource } from "@/lib/data-source";
import { avatarTint } from "@/lib/avatar-tint";
import { buildMatchesPage, fetchMatchesPageRows, parsePage } from "@/lib/loaders/matches";
import { MatchesList } from "@/components/matches-list";
import { MatchesFilter } from "@/components/matches-filter";
import { MatchesPagination } from "@/components/matches-pagination";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; page?: string }>;
}) {
  const { player: playerFilter, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const supabase = await createClient();

  const [pageRows, version] = await Promise.all([
    fetchMatchesPageRows(privateSource(supabase), {
      playerSlug: playerFilter ?? null,
      page,
    }),
    getLatestVersion(),
  ]);

  const { players, selectedPlayer, entries, totalMatches, totalPages } = buildMatchesPage(
    pageRows,
    playerFilter ?? null,
  );

  // Page 1 always renders — an empty roster or an unplayed filter is a valid
  // empty state, not a 404. Anything past the end is a genuine 404, the same
  // way /champions treats an unknown ?player=.
  if (page > 1 && entries.length === 0) notFound();

  // Notes for exactly the rows about to render. Eager rather than fetched on
  // expand, so a collapsed row can show its note count — otherwise annotated
  // games are invisible until you open every one of them.
  const [notesByParticipantId, session, championMap] = await Promise.all([
    notesByParticipant(
      supabase,
      entries.map((e) => e.viewer.id),
    ),
    getSession(),
    getChampionMap(version),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {selectedPlayer && (
            <Avatar size="lg">
              {selectedPlayer.avatar_url && <AvatarImage src={selectedPlayer.avatar_url} alt="" />}
              <AvatarFallback style={avatarTint(selectedPlayer.display_name)}>
                {selectedPlayer.display_name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          <div>
            <h1 className="font-heading text-2xl font-semibold text-white">Matches</h1>
            <p className="text-sm text-grey-light">
              {selectedPlayer
                ? `${selectedPlayer.display_name}'s match history.`
                : "Every tracked match across the squad."}
            </p>
          </div>
        </div>
        <MatchesFilter players={players} selectedId={selectedPlayer?.slug ?? null} />
      </div>

      <div className="flex flex-col gap-2">
        <MatchesList
          entries={entries}
          version={version}
          championMap={championMap}
          showPlayerName={!selectedPlayer}
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
        page={page}
        totalPages={totalPages}
        totalMatches={totalMatches}
        playerSlug={selectedPlayer?.slug ?? null}
      />
    </main>
  );
}
