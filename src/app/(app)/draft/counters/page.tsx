import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadChampionCounters, loadChampionProfiles } from "@/lib/draft/queries";
import { CounterBrowser } from "@/components/draft/counter-browser";

export default async function DraftCountersPage() {
  const source = privateSource(await createClient());
  const version = await getLatestVersion();

  const [championMap, counters, profiles] = await Promise.all([
    getChampionMap(version),
    loadChampionCounters(source),
    loadChampionProfiles(source),
  ]);

  return (
    <CounterBrowser
      champions={realChampions(championMap)}
      version={version}
      counters={counters}
      profiles={[...profiles.values()]}
    />
  );
}
