import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { buildDashboard, fetchDashboardRows } from "@/lib/loaders/dashboard";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { DashboardView } from "@/components/dashboard/dashboard-view";

// Rendered per request, with the data cached for an hour underneath — see the
// header of demo-cache.ts for why it isn't `export const revalidate`.
export const dynamic = "force-dynamic";

// The same page as `/`, against the demo views.
//
// Three things are missing and all three are missing by omission rather than by
// a branch inside the view: the sync card (the demo has no business reading
// `sync_state`), the clan recap (there is no demo view of `team_ai_summary` —
// public prose is published by hand, ADR-039, and the team summary has no such
// pipeline yet) and match notes (no `demo_match_notes` exists to read).
//
// This is the demo's landing page because it is the app's landing page. The
// roster grid that used to live here is at /demo/team, where /team is.
export default async function DemoPage() {
  // Cache the rows, fold them here — cachedDemoLoad's entries are serialized, so
  // the Maps buildDashboard produces have to be built after the cache, not
  // inside it.
  const [rows, version] = await Promise.all([
    cachedDemoLoad("dashboard", () => fetchDashboardRows(demoSource(createPublicClient()))),
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
    />
  );
}
