import { createClient } from "@/lib/supabase/server";
import { PlayerCard } from "@/components/player-card";
import { rankSortKey } from "@/lib/rank";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { topChampionsByPlayer, type ChampionStatInput } from "@/lib/champion-stats";

export default async function Home() {
  const supabase = await createClient();
  const { data: players } = await supabase
    .from("players")
    .select(
      "id, display_name, riot_game_name, riot_tag_line, avatar_url, tier, division, league_points, wins, losses",
    );

  const sorted = [...(players ?? [])].sort((a, b) => rankSortKey(a) - rankSortKey(b));

  // One bulk query across every tracked player rather than one per card —
  // grouping into per-player top-5 champions happens in JS afterward.
  const { data: statRows } = await supabase
    .from("match_participants")
    .select(
      "player_id, champion_id, champion_name, win, total_cs, damage_dealt_to_champions, matches!inner(game_duration_seconds)",
    )
    .not("player_id", "is", null)
    .returns<(Omit<ChampionStatInput, "game_duration_seconds"> & { matches: { game_duration_seconds: number } | null })[]>();

  const flatRows: ChampionStatInput[] = (statRows ?? []).map((r) => ({
    ...r,
    game_duration_seconds: r.matches?.game_duration_seconds ?? 0,
  }));
  const topChampionsByPlayerId = topChampionsByPlayer(flatRows);

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 py-8 sm:px-6">
      {sorted.length === 0 ? (
        <p className="text-center text-sm text-grey-mid">
          No players tracked yet — add some from the{" "}
          <a href="/admin" className="text-blue-primary hover:underline">
            admin page
          </a>
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
    </main>
  );
}
