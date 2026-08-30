import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { rows } from "@/lib/supabase/read";
import { loadTeamGames } from "@/lib/team/queries";
import {
  TeamOverviewView,
  type TeamRosterRow,
} from "@/components/team/views/overview-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

export default async function TeamOverviewPage() {
  const supabase = await createClient();

  const [games, rosterResult] = await Promise.all([
    loadTeamGames(privateSource(supabase)),
    supabase
      .from("players")
      .select("id, slug, display_name, avatar_url")
      .order("display_name")
      .returns<TeamRosterRow[]>(),
  ]);

  if (games.length === 0) return <TeamMatchEmptyState canAdd />;

  return <TeamOverviewView games={games} roster={rows(rosterResult, "roster")} />;
}
