import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadChampionCounters, loadChampionProfiles } from "@/lib/draft/queries";
import { CounterBrowser } from "@/components/draft/counter-browser";

export const dynamic = "force-dynamic";

// The matchup graph survives; the prose on it does not. Four of the sixteen
// noted matchups carry a note, and demo_champion_counters nulls all of them —
// they are someone's own words about a matchup, in Spanish, written for the
// people who play here.
export default async function DemoDraftCountersPage() {
  const source = () => demoSource(createPublicClient());
  const version = await getLatestVersion();

  const [championMap, counters, profiles] = await Promise.all([
    getChampionMap(version),
    cachedDemoLoad("draft-counters", () => loadChampionCounters(source())),
    cachedDemoLoad("draft-profiles", async () => [
      ...(await loadChampionProfiles(source())).values(),
    ]),
  ]);

  return (
    <CounterBrowser
      champions={realChampions(championMap)}
      version={version}
      counters={counters}
      profiles={profiles}
      readOnly
    />
  );
}
