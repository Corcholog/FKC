import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { findOpponentBySlug, loadScrimGames } from "@/lib/scrims/queries";
import { OpponentScoutingView } from "@/components/scrims/views/opponent-scouting-view";
import { OpponentNotesForm } from "@/components/scrims/opponent-notes-form";

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

  return (
    <OpponentScoutingView
      opponent={opponent}
      games={games}
      version={version}
      championMap={await getChampionMap(version)}
      notesForm={
        <OpponentNotesForm opponentId={opponent.id} initialNotes={opponent.notes ?? ""} />
      }
    />
  );
}
