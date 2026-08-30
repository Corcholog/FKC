import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadTeamGames } from "@/lib/team/queries";
import { TeamDraftsView } from "@/components/team/views/drafts-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

export const dynamic = "force-dynamic";

// The first demo scrim page to be built, on purpose: it renders champions and
// rates and no names at all, so it proves the demo_team_* views are wired up
// without any aliasing in the way to make a wrong answer look plausible.
export default async function DemoTeamDraftsPage() {
  const [games, version] = await Promise.all([
    cachedDemoLoad("scrim-games", () => loadTeamGames(demoSource(createPublicClient()))),
    getLatestVersion(),
  ]);

  if (games.length === 0) return <TeamMatchEmptyState />;

  return (
    <TeamDraftsView games={games} version={version} championMap={await getChampionMap(version)} />
  );
}
