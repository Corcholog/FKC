import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { rows } from "@/lib/supabase/read";
import { loadScrimGames } from "@/lib/scrims/queries";
import {
  ScrimsOverviewView,
  type ScrimsRosterRow,
} from "@/components/scrims/views/scrims-overview-view";
import { ScrimEmptyState } from "@/components/scrims/scrim-empty-state";

export const dynamic = "force-dynamic";

export default async function DemoScrimsOverviewPage() {
  const source = () => demoSource(createPublicClient());

  const [games, roster] = await Promise.all([
    cachedDemoLoad("scrim-games", () => loadScrimGames(source())),
    cachedDemoLoad("scrim-roster", async () => {
      const s = source();
      return rows(
        await s.supabase
          .from(s.table("players"))
          .select("id, slug, display_name, avatar_url")
          .order("display_name")
          .returns<ScrimsRosterRow[]>(),
        "roster",
      );
    }),
  ]);

  if (games.length === 0) return <ScrimEmptyState />;

  return <ScrimsOverviewView games={games} roster={roster} basePath="/demo" />;
}
