import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadTeamGames } from "@/lib/team/queries";
import { fetchTeamHistoryRows } from "@/lib/loaders/team-history";
import {
  buildFlexHistory,
  buildTeamMatchHistory,
  filterHistory,
  historyViewCounts,
  mergeHistory,
  parseHistoryView,
} from "@/lib/team/history";
import { TeamHistoryView } from "@/components/team/views/matches-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

export const dynamic = "force-dynamic";

type RosterRow = { id: string; slug: string; display_name: string };

export default async function DemoTeamMatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: viewParam } = await searchParams;
  const view = parseHistoryView(viewParam);
  const source = () => demoSource(createPublicClient());

  const [games, flexRows, roster, version] = await Promise.all([
    cachedDemoLoad("team-games", () => loadTeamGames(source())),
    // The rows, not the folded result: cachedDemoLoad serializes its entries,
    // so anything cached here has to survive a JSON round trip. See
    // demo-cache.ts.
    cachedDemoLoad("team-history-flex", () =>
      fetchTeamHistoryRows(demoSource(createPublicClient(), "flex")),
    ),
    cachedDemoLoad("team-player-names", async () => {
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

  const entries = mergeHistory(buildFlexHistory(flexRows.flex), buildTeamMatchHistory(games));
  if (entries.length === 0) return <TeamMatchEmptyState />;

  return (
    <TeamHistoryView
      entries={filterHistory(entries, view)}
      counts={historyViewCounts(entries)}
      view={view}
      version={version}
      championMap={await getChampionMap(version)}
      playerNames={
        new Map(roster.map((p) => [p.id, { display_name: p.display_name, slug: p.slug }]))
      }
      basePath="/demo"
    />
  );
}
