import { createClient } from "@/lib/supabase/server";
import { PlayerCard } from "@/components/player-card";
import { rankSortKey } from "@/lib/rank";

export default async function Home() {
  const supabase = await createClient();
  const { data: players } = await supabase
    .from("players")
    .select(
      "id, display_name, riot_game_name, riot_tag_line, avatar_url, tier, division, league_points, wins, losses",
    );

  const sorted = [...(players ?? [])].sort((a, b) => rankSortKey(a) - rankSortKey(b));

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
        sorted.map((player) => <PlayerCard key={player.id} player={player} />)
      )}
    </main>
  );
}
