import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseQueueScope, privateSource } from "@/lib/data-source";
import {
  buildChampionPool,
  fetchChampionRows,
  fetchChampionsRoster,
} from "@/lib/loaders/champions";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { avatarTint } from "@/lib/avatar-tint";
import { ChampionsFilter } from "@/components/champions-filter";
import { ChampionTierList } from "@/components/champion-tier-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default async function ChampionsPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; queue?: string }>;
}) {
  const { player: playerParam, queue: queueParam } = await searchParams;
  const queue = parseQueueScope(queueParam);
  const source = privateSource(await createClient(), queue);

  // Note what the empty state below now means. Before the read helper it covered
  // both "no players tracked" and "the roster read failed", and told you the first.
  const players = await fetchChampionsRoster(source);

  if (players.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-white">Champions</h1>
          <p className="text-sm text-grey-light">Per-player champion stats.</p>
        </div>
        <p className="text-sm text-grey-mid">No players tracked yet.</p>
      </main>
    );
  }

  const selectedPlayer = players.find((p) => p.slug === playerParam) ?? players[0];
  if (playerParam && !players.some((p) => p.slug === playerParam)) notFound();

  const statRows = await fetchChampionRows(source, selectedPlayer.id);
  const champions = buildChampionPool(statRows, selectedPlayer.id);

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            {selectedPlayer.avatar_url && <AvatarImage src={selectedPlayer.avatar_url} alt="" />}
            <AvatarFallback style={avatarTint(selectedPlayer.display_name)}>
              {selectedPlayer.display_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-heading text-2xl font-semibold text-white">Champions</h1>
            <p className="text-sm text-grey-light">
              {selectedPlayer.display_name}&apos;s champion stats.
            </p>
          </div>
        </div>
        <ChampionsFilter players={players} selectedId={selectedPlayer.slug} />
      </div>

      <ChampionTierList champions={champions} version={version} championMap={championMap} />
    </main>
  );
}
