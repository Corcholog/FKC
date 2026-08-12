import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadChampionProfiles } from "@/lib/draft/queries";
import { DraftSimulator } from "@/components/draft/draft-simulator";

export default async function DraftPage() {
  const supabase = await createClient();
  const version = await getLatestVersion();

  const [championMap, profiles] = await Promise.all([
    getChampionMap(version),
    loadChampionProfiles(supabase),
  ]);

  // Plain arrays, not the Maps these come as: the simulator is a client
  // component and a Map doesn't survive the boundary.
  return (
    <DraftSimulator
      champions={realChampions(championMap)}
      version={version}
      profiles={[...profiles.values()]}
    />
  );
}
