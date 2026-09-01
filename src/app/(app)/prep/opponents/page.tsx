import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { loadOpponents, loadTeamGames } from "@/lib/team/queries";
import { TeamOpponentsView } from "@/components/team/views/opponents-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

export default async function TeamOpponentsPage() {
  const source = privateSource(await createClient());
  const [games, opponents] = await Promise.all([loadTeamGames(source), loadOpponents(source)]);

  if (opponents.length === 0) return <TeamMatchEmptyState what="No opponents yet." canAdd />;

  return <TeamOpponentsView games={games} opponents={opponents} />;
}
