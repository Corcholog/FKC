import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadChampionProfiles, loadDraftTags } from "@/lib/draft/queries";
import { ChampionProfileTable } from "@/components/draft/champion-profile-table";

export default async function DraftChampionsPage() {
  const supabase = await createClient();
  const version = await getLatestVersion();

  const [championMap, functionTags, profiles] = await Promise.all([
    getChampionMap(version),
    loadDraftTags(supabase, "function"),
    loadChampionProfiles(supabase),
  ]);

  return (
    <ChampionProfileTable
      champions={realChampions(championMap)}
      version={version}
      functionTags={functionTags}
      profiles={[...profiles.values()]}
    />
  );
}
