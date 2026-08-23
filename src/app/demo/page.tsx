import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { optional } from "@/lib/supabase/read";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { buildDashboard, fetchDashboardRows } from "@/lib/loaders/dashboard";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { TeamSummaryCard } from "@/components/team-summary-card";

type DemoRecap = { summary_text: string; generated_at: string };

/**
 * The published clan recap, or null.
 *
 * Its own read rather than part of fetchDashboardRows, because that loader is
 * shared with `/` and the two recaps are different rows in different tables:
 * the private one is `team_ai_summary`, written nightly; this is `demo_text`
 * under `source = 'team_summary'`, written by a person pressing Publish
 * (migration 021). Null until they do — the view filters out blank bodies — and
 * the card is then not rendered at all rather than rendered empty.
 *
 * `optional`, not `maybeRow`, which is the case read.ts describes: a recap that
 * failed to load should cost the reader a card, not the page. It also decouples
 * this deploy from that migration — before 021 runs, the view doesn't exist and
 * the read is a 42P01, which lands in the log and leaves the dashboard whole.
 */
async function fetchDemoRecap(): Promise<DemoRecap | null> {
  return optional(
    await createPublicClient()
      .from("demo_team_summary")
      .select("summary_text, generated_at")
      .maybeSingle<DemoRecap>(),
    "demo clan recap",
    null,
  );
}

// Rendered per request, with the data cached for an hour underneath — see the
// header of demo-cache.ts for why it isn't `export const revalidate`.
export const dynamic = "force-dynamic";

// The same page as `/`, against the demo views.
//
// Two things are missing, and both are missing by omission rather than by a
// branch inside the view: the sync card (the demo has no business reading
// `sync_state`) and match notes (no `demo_match_notes` exists to read). The
// third, the clan recap, is a different row rather than an absent one — see
// fetchDemoRecap.
//
// This is the demo's landing page because it is the app's landing page. The
// roster grid that used to live here is at /demo/team, where /team is.
export default async function DemoPage() {
  // Cache the rows, fold them here — cachedDemoLoad's entries are serialized, so
  // the Maps buildDashboard produces have to be built after the cache, not
  // inside it.
  const [rows, recap, version] = await Promise.all([
    cachedDemoLoad("dashboard", () => fetchDashboardRows(demoSource(createPublicClient()))),
    cachedDemoLoad("team-recap", fetchDemoRecap),
    getLatestVersion(),
  ]);

  const dashboard = buildDashboard(rows);
  const championMap = await getChampionMap(version);

  return (
    <DashboardView
      dashboard={dashboard}
      version={version}
      championMap={championMap}
      basePath="/demo"
      intro={
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-semibold text-white">Dashboard</h1>
          <p className="max-w-2xl text-sm text-grey-light">
            A performance tracker built for a League of Legends roster. It pulls every ranked
            game from Riot&rsquo;s API, keeps all ten participants of each match, and turns that
            into per-player and cross-player analysis — rank history, champion pools, lane
            matchups, duo synergy and session tilt.
          </p>
          <p className="max-w-2xl text-sm text-grey-mid">
            Everything below is real data from live accounts. Names, tags and avatars are
            replaced; the statistics are not.
          </p>
        </div>
      }
      recap={
        recap && (
          <TeamSummaryCard summary={recap.summary_text} generatedAt={recap.generated_at} />
        )
      }
    />
  );
}
