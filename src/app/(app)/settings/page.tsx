import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { maybeRow, optional, rows } from "@/lib/supabase/read";
import { DEMO_SUMMARY_DRAFT_SOURCE, DEMO_SUMMARY_SOURCE } from "@/lib/summary-analyst";
import {
  DemoSummariesForm,
  type DemoSummaryDraft,
} from "@/components/settings/demo-summaries-form";
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

  // Admin client: demo_aliases and demo_text are both authenticated-only at the
  // RLS level and have no policy for the signed-in role, by design — they are a
  // back-office mapping, not app data. This page is the back office.
  const admin = createAdminClient();
  const [{ data: aliasRows }, { data: textRows }] = await Promise.all([
    admin.from("demo_aliases").select("player_id, alias").order("alias"),
    admin
      .from("demo_text")
      .select("source, row_id, body, updated_at")
      .in("source", [DEMO_SUMMARY_SOURCE, DEMO_SUMMARY_DRAFT_SOURCE]),
  ]);

  const rowsBySource = (source: string) =>
    new Map(
      (textRows ?? [])
        .filter((r) => r.source === source)
        .map((r) => [
          r.row_id as string,
          { body: (r.body as string) ?? "", updatedAt: (r.updated_at as string) ?? null },
        ]),
    );
  const draftRows = rowsBySource(DEMO_SUMMARY_DRAFT_SOURCE);
  const publishedRows = rowsBySource(DEMO_SUMMARY_SOURCE);

  const demoDrafts: DemoSummaryDraft[] = (aliasRows ?? []).map((r) => {
    const playerId = r.player_id as string;
    const draft = draftRows.get(playerId);
    const published = publishedRows.get(playerId);
    return {
      playerId,
      alias: r.alias as string,
      // The draft is the working copy. Falling back to the published text
      // covers rows published before drafts existed as a separate thing — and,
      // generally, an editor that opened empty on top of live text would be a
      // trap: pressing Publish would blank the demo.
      body: draft?.body ?? published?.body ?? "",
      updatedAt: draft?.updatedAt ?? published?.updatedAt ?? null,
      publishedBody: published?.body ?? "",
    };
  });

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
            Demo summaries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DemoSummariesForm drafts={demoDrafts} />
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
