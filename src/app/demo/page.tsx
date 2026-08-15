import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { buildRoster, fetchRosterRows } from "@/lib/loaders/roster";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { PlayerCard } from "@/components/player-card";

// Rendered per request, with the data cached for an hour underneath — see the
// header of demo-cache.ts for why it isn't `export const revalidate`.
export const dynamic = "force-dynamic";

export default async function DemoPage() {
  // Cache the rows, fold them here — cachedDemoLoad's entries are serialized, so
  // the Map that buildRoster produces has to be built after the cache, not
  // inside it.
  const rows = await cachedDemoLoad("roster", () =>
    fetchRosterRows(demoSource(createPublicClient())),
  );
  const { players, topChampionsByPlayerId } = buildRoster(rows);

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold text-white">Roster</h1>
        <p className="max-w-2xl text-sm text-grey-light">
          A performance tracker built for a five-person League of Legends roster. It pulls every
          ranked game from Riot&rsquo;s API, keeps all ten participants of each match, and turns
          that into per-player and cross-player analysis — rank history, champion pools, lane
          matchups, duo synergy and session tilt.
        </p>
        <p className="max-w-2xl text-sm text-grey-mid">
          Everything below is real data from live accounts. Names, tags and avatars are
          replaced; the statistics are not.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {players.length === 0 ? (
          <p className="text-center text-sm text-grey-mid">
            The demo roster hasn&rsquo;t been set up yet — no aliases have been assigned.
          </p>
        ) : (
          players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              topChampions={topChampionsByPlayerId.get(player.id) ?? []}
              version={version}
              championMap={championMap}
              // Unlinked until phase 3 builds /demo/player/[alias].
              basePath={null}
            />
          ))
        )}
      </div>
    </main>
  );
}
