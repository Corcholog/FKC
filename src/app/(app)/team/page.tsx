import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PlayerCard } from "@/components/player-card";
import { rankSortKey } from "@/lib/rank";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { topChampionsByPlayer, type ChampionStatInput } from "@/lib/champion-stats";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: players } = await supabase
    .from("players")
    .select(
      "id, slug, display_name, riot_game_name, riot_tag_line, avatar_url, tier, division, league_points, wins, losses",
    );

  const sorted = [...(players ?? [])].sort((a, b) => rankSortKey(a) - rankSortKey(b));

  // One bulk query across every tracked player rather than one per card —
  // grouping into per-player top-5 champions happens in JS afterward.
  type TeamStatRow = Omit<ChampionStatInput, "game_duration_seconds"> & {
    matches: { game_duration_seconds: number } | null;
  };

  const statRows = await fetchAllRows<TeamStatRow>((from, to) =>
    supabase
      .from("match_participants")
      .select(
        "player_id, champion_id, champion_name, win, total_cs, damage_dealt_to_champions, matches!inner(game_duration_seconds)",
      )
      .not("player_id", "is", null)
      .range(from, to)
      .returns<TeamStatRow[]>(),
  );

  const flatRows: ChampionStatInput[] = statRows.map((r) => ({
    ...r,
    game_duration_seconds: r.matches?.game_duration_seconds ?? 0,
  }));
  const topChampionsByPlayerId = topChampionsByPlayer(flatRows);

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
