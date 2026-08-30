import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadTeamGames } from "@/lib/team/queries";
import { TeamDraftsView } from "@/components/team/views/drafts-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

export default async function TeamDraftsPage() {
  const supabase = await createClient();
  const [games, version] = await Promise.all([
    loadTeamGames(privateSource(supabase)),
    getLatestVersion(),
  ]);

  if (games.length === 0) return <TeamMatchEmptyState canAdd />;

  return (
    <TeamDraftsView games={games} version={version} championMap={await getChampionMap(version)} />
  );
}
