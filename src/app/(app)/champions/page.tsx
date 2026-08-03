import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { allChampionsByPlayer, type ChampionStatInput } from "@/lib/champion-stats";
import { ChampionsFilter } from "@/components/champions-filter";
import { ChampionTierList } from "@/components/champion-tier-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type PlayerRow = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
};

export default async function ChampionsPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
}) {
  const { player: playerParam } = await searchParams;
  const supabase = await createClient();

  const { data: players } = await supabase
    .from("players")
    .select("id, slug, display_name, avatar_url")
    .order("display_name")
    .returns<PlayerRow[]>();

  if (!players || players.length === 0) {
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

  type ChampionStatRow = Omit<ChampionStatInput, "game_duration_seconds"> & {
    matches: { game_duration_seconds: number } | null;
  };

  const statRows = await fetchAllRows<ChampionStatRow>((from, to) =>
    supabase
      .from("match_participants")
      .select(
        "player_id, champion_id, champion_name, win, kills, deaths, assists, total_cs, damage_dealt_to_champions, matches!inner(game_duration_seconds)",
      )
      .eq("player_id", selectedPlayer.id)
      .range(from, to)
      .returns<ChampionStatRow[]>(),
  );

  const flatRows: ChampionStatInput[] = statRows.map((r) => ({
    ...r,
    game_duration_seconds: r.matches?.game_duration_seconds ?? 0,
  }));
  const champions = allChampionsByPlayer(flatRows).get(selectedPlayer.id) ?? [];

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            {selectedPlayer.avatar_url && <AvatarImage src={selectedPlayer.avatar_url} alt="" />}
            <AvatarFallback>{selectedPlayer.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-heading text-2xl font-semibold text-white">Champions</h1>
            <p className="text-sm text-grey-light">{selectedPlayer.display_name}&apos;s champion stats.</p>
          </div>
        </div>
        <ChampionsFilter players={players} selectedId={selectedPlayer.slug} />
      </div>

      <ChampionTierList champions={champions} version={version} championMap={championMap} />
    </main>
  );
}
