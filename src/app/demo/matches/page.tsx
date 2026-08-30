import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { buildMatchesPage, fetchMatchesPageRows, parsePage } from "@/lib/loaders/matches";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { avatarTint } from "@/lib/avatar-tint";
import { MatchesList } from "@/components/matches-list";
import { MatchesFilter } from "@/components/matches-filter";
import { MatchesPagination } from "@/components/matches-pagination";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

// The same page as /matches, against the demo views.
//
// No notes: `notesFor` is simply not passed, so every row renders collapsed and
// non-expandable. That is the whole of the difference — the demo never reads
// match_notes, and there is no demo view of that table to read.
export default async function DemoMatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; page?: string }>;
}) {
  const { player: playerFilter, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const playerSlug = playerFilter ?? null;

  const [pageRows, version] = await Promise.all([
    // Keyed by both filters, since they select different rows. A page number
    // past the end caches an empty array, which is the correct answer and costs
    // nothing to keep.
    cachedDemoLoad(`matches:${playerSlug ?? "all"}:${page}`, () =>
      fetchMatchesPageRows(demoSource(createPublicClient()), { playerSlug, page }),
    ),
    getLatestVersion(),
  ]);

  const { players, selectedPlayer, entries, totalMatches, totalPages } = buildMatchesPage(
    pageRows,
    playerSlug,
  );

  if (page > 1 && entries.length === 0) notFound();

  const championMap = await getChampionMap(version);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {selectedPlayer && (
            // No AvatarImage: demo_players.avatar_url is always null, so the
            // tinted initials are the whole avatar here.
            <Avatar size="lg">
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
        {/* Fixed rather than offered: the demo publishes one reading of the
            data, and every other surface on it is soloQ. */}
        <MatchesFilter
          players={players}
          selectedId={selectedPlayer?.slug ?? null}
          queue="solo"
          basePath="/demo"
        />
      </div>

      <div className="flex flex-col gap-2">
        <MatchesList
          entries={entries}
          version={version}
          championMap={championMap}
          showPlayerName={!selectedPlayer}
        />
      </div>

      <MatchesPagination
        page={page}
        totalPages={totalPages}
        totalMatches={totalMatches}
        playerSlug={selectedPlayer?.slug ?? null}
        basePath="/demo"
      />
    </main>
  );
}
