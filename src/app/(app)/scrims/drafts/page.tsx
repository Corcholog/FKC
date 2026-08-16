import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadScrimGames } from "@/lib/scrims/queries";
import { ScrimDraftsView } from "@/components/scrims/views/scrim-drafts-view";
import { ScrimEmptyState } from "@/components/scrims/scrim-empty-state";

export default async function ScrimDraftsPage() {
  const supabase = await createClient();
  const [games, version] = await Promise.all([
    loadScrimGames(privateSource(supabase)),
    getLatestVersion(),
  ]);

  if (games.length === 0) return <ScrimEmptyState canAdd />;

  return (
    <ScrimDraftsView games={games} version={version} championMap={await getChampionMap(version)} />
  );
}
