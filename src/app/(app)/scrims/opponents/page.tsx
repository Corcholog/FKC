import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { loadOpponents, loadScrimGames } from "@/lib/scrims/queries";
import { ScrimOpponentsView } from "@/components/scrims/views/scrim-opponents-view";
import { ScrimEmptyState } from "@/components/scrims/scrim-empty-state";

export default async function ScrimOpponentsPage() {
  const source = privateSource(await createClient());
  const [games, opponents] = await Promise.all([loadScrimGames(source), loadOpponents(source)]);

  if (opponents.length === 0) return <ScrimEmptyState what="No opponents yet." canAdd />;

  return <ScrimOpponentsView games={games} opponents={opponents} />;
}
