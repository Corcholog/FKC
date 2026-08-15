import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { loadRoster } from "@/lib/loaders/roster";
import { PlayerCard } from "@/components/player-card";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";

export default async function TeamPage() {
  const supabase = await createClient();
  const { players: sorted, topChampionsByPlayerId } = await loadRoster(privateSource(supabase));

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Team</h1>
        <p className="text-sm text-grey-light">Fake Clan roster, sorted by rank.</p>
      </div>

      <div className="flex flex-col gap-3">
        {sorted.length === 0 ? (
          <p className="text-center text-sm text-grey-mid">
            No players tracked yet — add some from{" "}
            <Link href="/settings" className="text-gold-bright hover:underline">
              Settings
            </Link>
            .
          </p>
        ) : (
          sorted.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              topChampions={topChampionsByPlayerId.get(player.id) ?? []}
              version={version}
              championMap={championMap}
            />
          ))
        )}
      </div>
    </main>
  );
}
