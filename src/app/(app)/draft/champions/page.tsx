import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadChampionCounters, loadChampionProfiles, loadDraftTags } from "@/lib/draft/queries";
import { ChampionProfileTable } from "@/components/draft/champion-profile-table";

export default async function DraftChampionsPage() {
  const supabase = await createClient();
  const version = await getLatestVersion();

  const [championMap, functionTags, profiles, counters] = await Promise.all([
    getChampionMap(version),
    loadDraftTags(supabase, "function"),
    loadChampionProfiles(supabase),
    loadChampionCounters(supabase),
  ]);

  return (
    <ChampionProfileTable
      champions={realChampions(championMap)}
      version={version}
      functionTags={functionTags}
      profiles={[...profiles.values()]}
      counters={counters}
    />
  );
}
