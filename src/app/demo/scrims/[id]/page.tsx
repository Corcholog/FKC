import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadSeries } from "@/lib/scrims/queries";
import { ScrimSeriesView } from "@/components/scrims/views/scrim-series-view";

export const dynamic = "force-dynamic";

type RosterRow = { id: string; slug: string; display_name: string };

// No `actions` and no `notesFor` — so no Edit, no Delete, and no review threads.
// Both are omitted by not passing the slot rather than by a flag the view checks.
export default async function DemoScrimSeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const source = () => demoSource(createPublicClient());

  const [games, roster, version] = await Promise.all([
    cachedDemoLoad(`scrim-series:${id}`, () => loadSeries(source(), id)),
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

  if (games.length === 0) notFound();

  return (
    <ScrimSeriesView
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
