import { createClient } from "@/lib/supabase/server";
import { optional, rows } from "@/lib/supabase/read";
import { formatRelativeTime } from "@/lib/format";
import { RefetchDetailsForm } from "@/components/settings/refetch-details-form";
import { SyncStatusSection, type SyncState } from "@/components/settings/sync-status-section";
import { FlexDiscovery, type FlexAccount } from "@/components/settings/flex-discovery";
import { SectionCard } from "@/components/section-card";

type ScoutRow = {
  puuid: string;
  player_id: string;
  riot_game_name: string;
  riot_tag_line: string;
  track_flex: boolean;
};

export default async function SettingsSyncPage() {
  const supabase = await createClient();

  const [syncStateResult, accountsResult, playersResult] = await Promise.all([
    supabase
      .from("sync_state")
      .select(
        "riot_key_valid, last_sync_status, last_sync_finished_at, last_error, " +
          "last_solo_sync_at, last_flex_sync_at",
      )
      .eq("id", 1)
      // Typed, unlike before: `optional(..., null)` over an untyped read inferred
      // the row as `null`, so syncState narrowed to `never` inside the guard
      // below and every field access on it was a type error waiting to be tried.
      .single<SyncState>(),
    supabase
      .from("player_accounts")
      .select("puuid, player_id, riot_game_name, riot_tag_line, track_flex")
      .eq("track_flex", true)
      .order("riot_game_name")
      .returns<ScoutRow[]>(),
    supabase.from("players").select("id, display_name").returns<{ id: string; display_name: string }[]>(),
  ]);

  // sync_state uses .single(), so a missing singleton is already an error rather
  // than a null. Kept optional: this whole tab is status, and losing the row
  // shouldn't take the Riot key form down with it.
  const syncState = optional(syncStateResult, "sync state", null);

  const namesById = new Map(rows(playersResult, "roster").map((p) => [p.id, p.display_name]));
  const scouts: FlexAccount[] = rows(accountsResult, "flex accounts").map((account) => ({
    puuid: account.puuid,
    riot_game_name: account.riot_game_name,
    riot_tag_line: account.riot_tag_line,
    playerName: namesById.get(account.player_id) ?? "Unknown player",
  }));

  // Every "ago" here is formatted on the server and passed down as a string. The
  // sections below are client components, and formatting a timestamp in both
  // places runs it against two different clocks — which is a hydration mismatch
  // that only shows up as a console error nobody reads.
  return (
    <div className="flex flex-col gap-6">
      {syncState ? (
        <SectionCard title="Sync status">
          <SyncStatusSection
            state={syncState}
            lastSyncAgo={
              syncState.last_sync_finished_at
                ? formatRelativeTime(syncState.last_sync_finished_at)
                : null
            }
            soloSyncAgo={
              syncState.last_solo_sync_at
                ? formatRelativeTime(syncState.last_solo_sync_at)
                : null
            }
            flexSyncAgo={
              syncState.last_flex_sync_at
                ? formatRelativeTime(syncState.last_flex_sync_at)
                : null
            }
          />
        </SectionCard>
      ) : (
        <SectionCard title="Sync status">
          <p className="text-sm text-grey-mid">
            No sync state row yet — it is created the first time a sync runs.
          </p>
        </SectionCard>
      )}

      <FlexDiscovery scouts={scouts} />

      <SectionCard
        title="Backfill match detail"
        caption="Re-reads stored matches from Riot to fill columns added after they were synced. Time-boxed, so it may take several runs."
      >
        <RefetchDetailsForm />
      </SectionCard>
    </div>
  );
}
