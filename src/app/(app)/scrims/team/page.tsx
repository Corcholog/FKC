import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadScrimGames } from "@/lib/scrims/queries";
import { parseScrimFilter, type ScrimFilterParams } from "@/lib/scrims/filters";
import { ScrimTeamView } from "@/components/scrims/views/scrim-team-view";
import { ScrimEmptyState } from "@/components/scrims/scrim-empty-state";

type RosterRow = { id: string; slug: string; display_name: string };

export default async function ScrimTeamPage({
  searchParams,
}: {
  searchParams: Promise<ScrimFilterParams>;
}) {
  const filter = parseScrimFilter(await searchParams);
  const supabase = await createClient();

  const [games, rosterResult, version] = await Promise.all([
    loadScrimGames(privateSource(supabase)),
    supabase.from("players").select("id, slug, display_name").returns<RosterRow[]>(),
    getLatestVersion(),
  ]);

  if (games.length === 0) return <ScrimEmptyState canAdd />;

  const championMap = await getChampionMap(version);
  const roster = rows(rosterResult, "roster");

  return (
    <ScrimTeamView
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
