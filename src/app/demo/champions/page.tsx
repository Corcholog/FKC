import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import {
  buildChampionPool,
  fetchChampionRows,
  fetchChampionsRoster,
} from "@/lib/loaders/champions";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { avatarTint } from "@/lib/avatar-tint";
import { ChampionsFilter } from "@/components/champions-filter";
import { ChampionTierList } from "@/components/champion-tier-list";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

export default async function DemoChampionsPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
}) {
  const { player: playerParam } = await searchParams;
  const source = () => demoSource(createPublicClient());

  const players = await cachedDemoLoad("champions-roster", () => fetchChampionsRoster(source()));

  if (players.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold text-white">Champions</h1>
        <p className="text-sm text-grey-mid">
          The demo roster hasn&rsquo;t been set up yet — no aliases have been assigned.
        </p>
      </main>
    );
  }

  const selectedPlayer = players.find((p) => p.slug === playerParam) ?? players[0];
  if (playerParam && !players.some((p) => p.slug === playerParam)) notFound();

  const statRows = await cachedDemoLoad(`champions:${selectedPlayer.slug}`, () =>
    fetchChampionRows(source(), selectedPlayer.id),
  );
  const champions = buildChampionPool(statRows, selectedPlayer.id);

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* No AvatarImage: demo_players.avatar_url is always null, so the
              tinted initials are the whole avatar here. */}
          <Avatar size="lg">
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
        <ChampionsFilter
          players={players}
          selectedId={selectedPlayer.slug}
          basePath="/demo"
        />
      </div>

      <ChampionTierList champions={champions} version={version} championMap={championMap} />
    </main>
  );
}
