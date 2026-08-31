import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { rows } from "@/lib/supabase/read";
import { loadTeamGames } from "@/lib/team/queries";
import { loadTeamRoster } from "@/lib/team/roster";
import { loadTeamOverviewFlex } from "@/lib/loaders/team-overview";
import {
  TeamOverviewView,
  type TeamRosterRow,
} from "@/components/team/views/overview-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

export default async function TeamOverviewPage() {
  const supabase = await createClient();

  const [games, rosterResult, team, flex] = await Promise.all([
    loadTeamGames(privateSource(supabase)),
    // Two reads of the same table, asking two different questions, and keeping
    // them apart is the point of migration 026.
    //
    // This one is a *name lookup*: which id belongs to which face. It stays
    // wide deliberately — a substitute who is on the roster but not on the main
    // team still played the game, and narrowing this would render them as
    // "Unknown" rather than leaving them out.
    supabase
      .from("players")
      .select("id, slug, display_name, avatar_url")
      .order("display_name")
      .returns<TeamRosterRow[]>(),
    // This one is the *claim*: who the main team is, in role order, whether or
    // not they have played anything yet.
    loadTeamRoster(privateSource(supabase)),
    loadTeamOverviewFlex(supabase),
  ]);

  // The empty state is about the entry form, so it only applies when there is
  // nothing to enter *and* nothing arrived from Riot either. A roster that has
  // played flex but typed no scrims still has a page worth rendering.
  const hasFlex = flex.record.games + flex.split.partial.length + flex.split.civilWars.length > 0;
  if (games.length === 0 && !hasFlex) return <TeamMatchEmptyState canAdd />;

  return (
    <TeamOverviewView
      games={games}
      roster={rows(rosterResult, "roster")}
      team={team}
      flex={flex}
    />
  );
}
