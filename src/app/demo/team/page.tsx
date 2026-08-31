import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { rows } from "@/lib/supabase/read";
import { loadTeamGames } from "@/lib/team/queries";
import { loadTeamRoster } from "@/lib/team/roster";
import {
  buildTeamOverview,
  demoFlexSource,
  fetchTeamOverviewRows,
} from "@/lib/loaders/team-overview";
import {
  TeamOverviewView,
  type TeamRosterRow,
} from "@/components/team/views/overview-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

export const dynamic = "force-dynamic";

export default async function DemoTeamOverviewPage() {
  const source = () => demoSource(createPublicClient());

  const team = await cachedDemoLoad("team-lineup", () =>
    loadTeamRoster(demoSource(createPublicClient())),
  );
  const teamPlayerIds = new Set(team.map((m) => m.id));

  const [games, roster, flexRows] = await Promise.all([
    cachedDemoLoad("team-games", () => loadTeamGames(source())),
    cachedDemoLoad("team-roster", async () => {
      const s = source();
      return rows(
        await s.supabase
          .from(s.table("players"))
          .select("id, slug, display_name, avatar_url")
          .order("display_name")
          .returns<TeamRosterRow[]>(),
        "roster",
      );
    }),
    // The rows, not the folded result: cachedDemoLoad serializes its entries,
    // and buildTeamOverview returns Maps — which come back as plain objects on
    // the second request, with every .get() on them throwing. The trap is that
    // the first request is a cache miss and works perfectly. See demo-cache.ts.
    cachedDemoLoad("team-flex", () => fetchTeamOverviewRows(demoFlexSource(createPublicClient()))),
  ]);

  const flex = buildTeamOverview(flexRows, teamPlayerIds);
  if (games.length === 0 && flex.record.games === 0) return <TeamMatchEmptyState />;

  return (
    <TeamOverviewView
      games={games}
      roster={roster}
      team={team}
      flex={flex}
      basePath="/demo"
    />
  );
}
