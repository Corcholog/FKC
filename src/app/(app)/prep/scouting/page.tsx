import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadTeamGames } from "@/lib/team/queries";
import { parseTeamMatchFilter, type TeamMatchFilterParams } from "@/lib/team/filters";
import { TeamScoutingView } from "@/components/team/views/scouting-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

type RosterRow = { id: string; slug: string; display_name: string };

export default async function TeamScoutingPage({
  searchParams,
}: {
  searchParams: Promise<TeamMatchFilterParams>;
}) {
  const filter = parseTeamMatchFilter(await searchParams);
  const supabase = await createClient();

  const [games, rosterResult, version] = await Promise.all([
    loadTeamGames(privateSource(supabase)),
    supabase.from("players").select("id, slug, display_name").returns<RosterRow[]>(),
    getLatestVersion(),
  ]);

  if (games.length === 0) return <TeamMatchEmptyState canAdd />;

  const championMap = await getChampionMap(version);
  const roster = rows(rosterResult, "roster");

  return (
    <TeamScoutingView
      games={games}
      filter={filter}
      version={version}
      championMap={championMap}
      // The filter's champion pickers search this list, so it is the full
      // DDragon roster rather than only champions this team has played: "have we
      // ever faced Ambessa" is a question worth being able to ask and get "no"
      // to, and a list built from the games themselves can only ever answer yes.
      champions={[...championMap.entries()].map(([championId, info]) => ({
        championId,
        ...info,
      }))}
      playerNames={
        new Map(roster.map((p) => [p.id, { display_name: p.display_name, slug: p.slug }]))
      }
    />
  );
}
