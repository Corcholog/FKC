import { createClient } from "@/lib/supabase/server";
import { AddPlayerForm } from "@/components/admin/add-player-form";
import { PlayerRow } from "@/components/admin/player-row";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: players } = await supabase
    .from("players")
    .select("id, riot_game_name, riot_tag_line, display_name, avatar_url")
    .order("display_name");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="mb-1 text-xl font-semibold text-white">Admin</h1>
        <p className="text-sm text-grey-light">Add, edit, or remove tracked players.</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium tracking-wide text-grey-light uppercase">
          Add player
        </h2>
        <AddPlayerForm />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium tracking-wide text-grey-light uppercase">
          Roster ({players?.length ?? 0})
        </h2>
        {!players || players.length === 0 ? (
          <p className="text-sm text-grey-mid">No players tracked yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {players.map((player) => (
              <PlayerRow key={player.id} player={player} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
