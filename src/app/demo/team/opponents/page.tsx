import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { loadOpponents, loadTeamGames } from "@/lib/team/queries";
import { TeamOpponentsView } from "@/components/team/views/opponents-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

export const dynamic = "force-dynamic";

export default async function DemoTeamOpponentsPage() {
  const source = () => demoSource(createPublicClient());
  const [games, opponents] = await Promise.all([
    cachedDemoLoad("scrim-games", () => loadTeamGames(source())),
    cachedDemoLoad("scrim-opponents", () => loadOpponents(source())),
  ]);

  if (opponents.length === 0) return <TeamMatchEmptyState what="No opponents yet." />;

  return <TeamOpponentsView games={games} opponents={opponents} basePath="/demo" />;
}
