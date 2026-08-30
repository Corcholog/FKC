import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { rows } from "@/lib/supabase/read";
import { loadTeamGames } from "@/lib/team/queries";
import {
  TeamOverviewView,
  type TeamRosterRow,
} from "@/components/team/views/overview-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

export const dynamic = "force-dynamic";

export default async function DemoTeamOverviewPage() {
  const source = () => demoSource(createPublicClient());

  const [games, roster] = await Promise.all([
    cachedDemoLoad("scrim-games", () => loadTeamGames(source())),
    cachedDemoLoad("scrim-roster", async () => {
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
  ]);

  if (games.length === 0) return <TeamMatchEmptyState />;

  return <TeamOverviewView games={games} roster={roster} basePath="/demo" />;
}
