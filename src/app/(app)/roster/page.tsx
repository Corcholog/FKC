import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { loadRoster } from "@/lib/loaders/roster";
import { PlayerCard } from "@/components/player-card";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";

export default async function TeamRosterPage() {
  const supabase = await createClient();
  const { players: sorted, topChampionsByPlayerId } = await loadRoster(privateSource(supabase));

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);

  // No <main> and no heading: /team/layout.tsx owns both. This was a top-level
  // route until the team section absorbed it.
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-grey-light">Fake Clan roster, sorted by rank.</p>

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
    </div>
  );
}
