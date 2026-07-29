import { createClient } from "@/lib/supabase/server";
import { AddPlayerForm } from "@/components/settings/add-player-form";
import { PlayerRow } from "@/components/settings/player-row";
import { SyncStatusSection } from "@/components/settings/sync-status-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: players } = await supabase
    .from("players")
    .select("id, riot_game_name, riot_tag_line, display_name, avatar_url")
    .order("display_name");
  const { data: syncState } = await supabase
    .from("sync_state")
    .select("riot_key_valid, last_sync_status, last_sync_finished_at, last_error")
    .eq("id", 1)
    .single();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-grey-light">Manage the roster and sync configuration.</p>
      </div>

      {syncState && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base tracking-wide text-grey-light uppercase">
              Sync status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SyncStatusSection state={syncState} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base tracking-wide text-grey-light uppercase">
            Add player
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AddPlayerForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base tracking-wide text-grey-light uppercase">
            Roster ({players?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!players || players.length === 0 ? (
            <p className="text-sm text-grey-mid">No players tracked yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {players.map((player) => (
                <PlayerRow key={player.id} player={player} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
