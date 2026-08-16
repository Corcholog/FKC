import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadScrimGames } from "@/lib/scrims/queries";
import { ScrimHistoryView } from "@/components/scrims/views/scrim-history-view";
import { ScrimEmptyState } from "@/components/scrims/scrim-empty-state";

export const dynamic = "force-dynamic";

type RosterRow = { id: string; slug: string; display_name: string };

export default async function DemoScrimHistoryPage() {
  const source = () => demoSource(createPublicClient());

  const [games, roster, version] = await Promise.all([
    cachedDemoLoad("scrim-games", () => loadScrimGames(source())),
    cachedDemoLoad("scrim-player-names", async () => {
      const s = source();
      return rows(
        await s.supabase
          .from(s.table("players"))
          .select("id, slug, display_name")
          .returns<RosterRow[]>(),
        "roster",
      );
    }),
    getLatestVersion(),
  ]);

  if (games.length === 0) return <ScrimEmptyState />;

  return (
    <ScrimHistoryView
      games={games}
      version={version}
      championMap={await getChampionMap(version)}
      playerNames={
        new Map(roster.map((p) => [p.id, { display_name: p.display_name, slug: p.slug }]))
      }
      basePath="/demo"
    />
  );
}
