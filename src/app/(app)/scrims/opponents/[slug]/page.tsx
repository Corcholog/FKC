import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { findOpponentBySlug, loadScrimGames } from "@/lib/scrims/queries";
import { OpponentScoutingView } from "@/components/scrims/views/opponent-scouting-view";
import { OpponentNotesForm } from "@/components/scrims/opponent-notes-form";
import { BanPlanForm } from "@/components/scrims/ban-plan-form";

export default async function OpponentScoutingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const source = privateSource(await createClient());

  const opponent = await findOpponentBySlug(source, slug);
  if (!opponent) notFound();

  const [games, version] = await Promise.all([
    loadScrimGames(source, { opponentId: opponent.id }),
    getLatestVersion(),
  ]);
  const championMap = await getChampionMap(version);

  return (
    <OpponentScoutingView
      opponent={opponent}
      games={games}
      version={version}
      championMap={championMap}
      // A render prop rather than a plain slot, so the editor gets the pick
      // counts the view already derived instead of counting them again.
      banPlanForm={(pickCounts) => (
        <BanPlanForm
          opponentId={opponent.id}
          opponentName={opponent.name}
          initialPlan={opponent.target_bans}
          pickCounts={pickCounts}
          // The whole champion list, not only what they have played: a ban plan
          // is prep, and the champion you most want to pre-ban is often one
          // they have not shown you yet.
          champions={[...championMap.entries()].map(([championId, info]) => ({
            championId,
            ...info,
          }))}
          version={version}
        />
      )}
      notesForm={
        <OpponentNotesForm opponentId={opponent.id} initialNotes={opponent.notes ?? ""} />
      }
    />
  );
}
