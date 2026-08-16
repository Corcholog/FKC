import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { loadOpponents, loadScrimGames } from "@/lib/scrims/queries";
import { ScrimOpponentsView } from "@/components/scrims/views/scrim-opponents-view";
import { ScrimEmptyState } from "@/components/scrims/scrim-empty-state";

export const dynamic = "force-dynamic";

export default async function DemoScrimOpponentsPage() {
  const source = () => demoSource(createPublicClient());
  const [games, opponents] = await Promise.all([
    cachedDemoLoad("scrim-games", () => loadScrimGames(source())),
    cachedDemoLoad("scrim-opponents", () => loadOpponents(source())),
  ]);

  if (opponents.length === 0) return <ScrimEmptyState what="No opponents yet." />;

  return <ScrimOpponentsView games={games} opponents={opponents} basePath="/demo" />;
}
