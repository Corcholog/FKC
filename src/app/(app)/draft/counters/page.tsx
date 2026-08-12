import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadChampionCounters, loadChampionProfiles } from "@/lib/draft/queries";
import { CounterMatrix } from "@/components/draft/counter-matrix";

export default async function DraftCountersPage() {
  const supabase = await createClient();
  const version = await getLatestVersion();

  const [championMap, counters, profiles] = await Promise.all([
    getChampionMap(version),
    loadChampionCounters(supabase),
    loadChampionProfiles(supabase),
  ]);

  return (
    <CounterMatrix
      champions={realChampions(championMap)}
      version={version}
      counters={counters}
      profiles={[...profiles.values()]}
    />
  );
}
