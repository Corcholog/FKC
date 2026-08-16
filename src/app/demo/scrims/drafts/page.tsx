import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadScrimGames } from "@/lib/scrims/queries";
import { ScrimDraftsView } from "@/components/scrims/views/scrim-drafts-view";
import { ScrimEmptyState } from "@/components/scrims/scrim-empty-state";

export const dynamic = "force-dynamic";

// The first demo scrim page to be built, on purpose: it renders champions and
// rates and no names at all, so it proves the demo_scrim_* views are wired up
// without any aliasing in the way to make a wrong answer look plausible.
export default async function DemoScrimDraftsPage() {
  const [games, version] = await Promise.all([
    cachedDemoLoad("scrim-games", () => loadScrimGames(demoSource(createPublicClient()))),
    getLatestVersion(),
  ]);

  if (games.length === 0) return <ScrimEmptyState />;

  return (
    <ScrimDraftsView games={games} version={version} championMap={await getChampionMap(version)} />
  );
}
