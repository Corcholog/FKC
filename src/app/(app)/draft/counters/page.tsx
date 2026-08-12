import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadChampionCounters, loadChampionProfiles } from "@/lib/draft/queries";
import { CounterBrowser } from "@/components/draft/counter-browser";

export default async function DraftCountersPage() {
  const supabase = await createClient();
  const version = await getLatestVersion();

  const [championMap, counters, profiles] = await Promise.all([
    getChampionMap(version),
    loadChampionCounters(supabase),
    loadChampionProfiles(supabase),
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
