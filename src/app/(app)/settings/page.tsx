import { createClient } from "@/lib/supabase/server";
import { maybeRow, optional, rows } from "@/lib/supabase/read";
import { AddPlayerForm } from "@/components/settings/add-player-form";
import { PlayerRow } from "@/components/settings/player-row";
import { RefetchDetailsForm } from "@/components/settings/refetch-details-form";
import { ClanContextForm } from "@/components/settings/clan-context-form";
import { SyncStatusSection } from "@/components/settings/sync-status-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = await createClient();
  // The roster read is the one that matters here: this page is where players are
  // added and deleted, so an empty list rendered because the read failed reads
  // as "the roster is gone" on the exact page where someone would try to fix it.
  const players = rows(
    await supabase
      .from("players")
      .select("id, riot_game_name, riot_tag_line, display_name, avatar_url, user_id, ai_context")
      .order("display_name"),
    "roster",
  );
  // sync_state uses .single(), so a missing singleton is already an error rather
  // than a null. Kept optional: this section is status, and losing it shouldn't
  // block the roster CRUD below.
  const syncState = optional(
    await supabase
      .from("sync_state")
      .select("riot_key_valid, last_sync_status, last_sync_finished_at, last_error")
      .eq("id", 1)
      .single(),
    "sync state",
    null,
  );
  const clanProfile = maybeRow(
    await supabase
      .from("clan_profile")
      .select("context")
      .eq("id", 1)
      .maybeSingle<{ context: string | null }>(),
    "clan context",
  );
  const teamSummary = maybeRow(
    await supabase
      .from("team_ai_summary")
      .select("generated_at")
      .eq("id", 1)
      .maybeSingle<{ generated_at: string | null }>(),
    "team recap timestamp",
  );

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
            Clan context
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ClanContextForm
            initialContext={(clanProfile?.context as string | null) ?? null}
            lastGeneratedAt={(teamSummary?.generated_at as string | null) ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base tracking-wide text-grey-light uppercase">
            Backfill match detail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RefetchDetailsForm />
        </CardContent>
      </Card>

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
