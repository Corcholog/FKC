import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { findOpponentBySlug, loadScrimGames } from "@/lib/scrims/queries";
import { OpponentScoutingView } from "@/components/scrims/views/opponent-scouting-view";

export const dynamic = "force-dynamic";

// No `notesForm`: the private one writes free-text scouting notes onto
// scrim_opponents, and demo_scrim_opponents carries the column but the demo has
// nothing to write with. Omitting the slot drops the section entirely.
export default async function DemoOpponentScoutingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [opponent, version] = await Promise.all([
    cachedDemoLoad(`scrim-opponent:${slug}`, () =>
      findOpponentBySlug(demoSource(createPublicClient()), slug),
    ),
    getLatestVersion(),
  ]);
  if (!opponent) notFound();

  const games = await cachedDemoLoad(`scrim-games:${opponent.id}`, () =>
    loadScrimGames(demoSource(createPublicClient()), { opponentId: opponent.id }),
  );

  return (
    <OpponentScoutingView
      opponent={opponent}
      games={games}
      version={version}
      championMap={await getChampionMap(version)}
      basePath="/demo"
    />
  );
}
