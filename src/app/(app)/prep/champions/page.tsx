import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadChampionCounters, loadChampionProfiles, loadDraftTags } from "@/lib/draft/queries";
import { ChampionProfileTable } from "@/components/draft/champion-profile-table";

export default async function DraftChampionsPage() {
  const source = privateSource(await createClient());
  const version = await getLatestVersion();

  const [championMap, functionTags, profiles, counters] = await Promise.all([
    getChampionMap(version),
    loadDraftTags(source, "function"),
    loadChampionProfiles(source),
    loadChampionCounters(source),
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
