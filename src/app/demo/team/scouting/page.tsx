import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadTeamGames } from "@/lib/team/queries";
import { parseTeamMatchFilter, type TeamMatchFilterParams } from "@/lib/team/filters";
import { TeamScoutingView } from "@/components/team/views/scouting-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

export const dynamic = "force-dynamic";

type RosterRow = { id: string; slug: string; display_name: string };

// The filter reads from searchParams, so this page is per-visitor dynamic even
// by demo standards — but the *data* underneath it is the same cached array
// every other demo scrim page shares, under the same "scrim-games" key. A
// filtered view costs no extra read.
export default async function DemoTeamScoutingPage({
  searchParams,
}: {
  searchParams: Promise<TeamMatchFilterParams>;
}) {
  const filter = parseTeamMatchFilter(await searchParams);
  const source = () => demoSource(createPublicClient());

  const [games, roster, version] = await Promise.all([
    cachedDemoLoad("scrim-games", () => loadTeamGames(source())),
    cachedDemoLoad("scrim-player-names", async () => {
      const s = source();
      return rows(
        await s.supabase
          .from(s.table("players"))
          .select("id, slug, display_name")
          .returns<RosterRow[]>(),
        "roster",
      );
    }),
    getLatestVersion(),
  ]);

  if (games.length === 0) return <TeamMatchEmptyState />;

  const championMap = await getChampionMap(version);

  return (
    <TeamScoutingView
      games={games}
      filter={filter}
      version={version}
      championMap={championMap}
      champions={[...championMap.entries()].map(([championId, info]) => ({
        championId,
        ...info,
      }))}
      playerNames={
        new Map(roster.map((p) => [p.id, { display_name: p.display_name, slug: p.slug }]))
      }
      basePath="/demo"
    />
  );
}
