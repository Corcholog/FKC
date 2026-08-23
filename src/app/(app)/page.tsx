import { createClient } from "@/lib/supabase/server";
import { maybeRow, optional } from "@/lib/supabase/read";
import { getSession } from "@/lib/auth";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { formatRelativeTime } from "@/lib/format";
import { notesByParticipant } from "@/lib/match-notes";
import { privateSource } from "@/lib/data-source";
import { buildDashboard, fetchDashboardRows } from "@/lib/loaders/dashboard";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { TeamSummaryCard } from "@/components/team-summary-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// The private half of the dashboard. Everything that is *the dashboard* lives in
// loaders/dashboard.ts and components/dashboard/dashboard-view.tsx, which /demo
// renders too; what is left here is the three things the demo has no counterpart
// for — the sync card, the AI recap and match notes — each passed down as a slot.

export default async function DashboardPage() {
  const supabase = await createClient();

  const [dashboardRows, syncStateResult, teamSummaryResult, version] = await Promise.all([
    fetchDashboardRows(privateSource(supabase)),
    supabase
      .from("sync_state")
      .select("riot_key_valid, last_sync_status, last_sync_finished_at")
      .eq("id", 1)
      .single(),
    supabase
      .from("team_ai_summary")
      .select("summary_text, generated_at")
      .eq("id", 1)
      .maybeSingle(),
    getLatestVersion(),
  ]);

  const teamSummary = maybeRow(teamSummaryResult, "team recap");
  // Chrome, not content — a missing sync banner is not worth losing the page for.
  const syncState = optional(syncStateResult, "sync state", null);

  const dashboard = buildDashboard(dashboardRows);

  // Notes for exactly the rows about to render — the sliced feed, not every
  // entry the activity query produced. Eager rather than fetched on expand, so
  // a collapsed row can show its note count.
  const [notesByParticipantId, championMap, session] = await Promise.all([
    notesByParticipant(
      supabase,
      dashboard.activity.map((e) => e.viewer.id),
    ),
    getChampionMap(version),
    getSession(),
  ]);

  return (
    <DashboardView
      dashboard={dashboard}
      version={version}
      championMap={championMap}
      intro={
        <div>
          <h1 className="font-heading text-2xl font-semibold text-white">Dashboard</h1>
          <p className="text-sm text-grey-light">Fake Clan at a glance.</p>
        </div>
      }
      syncStatus={
        syncState && (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xs tracking-wide text-grey-light uppercase">
                Sync status
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Badge
                variant="outline"
                className={
                  syncState.riot_key_valid
                    ? "self-start border-win/40 text-win"
                    : "self-start border-warning/40 text-warning"
                }
              >
                {syncState.riot_key_valid ? "Riot key valid" : "Riot key invalid/expired"}
              </Badge>
              <span className="text-grey-light">
                {syncState.last_sync_finished_at
                  ? `Last sync ${formatRelativeTime(syncState.last_sync_finished_at)}`
                  : "Never synced yet"}
              </span>
            </CardContent>
          </Card>
        )
      }
      recap={
        <TeamSummaryCard
          summary={(teamSummary?.summary_text as string | null) ?? null}
          generatedAt={(teamSummary?.generated_at as string | null) ?? null}
        />
      }
      notesFor={({ viewer, player }) => ({
        participantId: viewer.id,
        playerId: viewer.player_id as string,
        ownerName: player?.display_name ?? "This player",
        items: notesByParticipantId.get(viewer.id) ?? [],
        canAdd: session?.player?.id === viewer.player_id,
        currentUserId: session?.user.id ?? null,
      })}
    />
  );
}
