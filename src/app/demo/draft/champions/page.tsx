import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import {
  loadChampionCounters,
  loadChampionProfiles,
  loadDraftTags,
} from "@/lib/draft/queries";
import { ChampionProfileTable } from "@/components/draft/champion-profile-table";

export const dynamic = "force-dynamic";

// The draft page with the most real content behind it: 96 annotated champions,
// and roles and tags both survive the demo view intact. Only `notes` is nulled,
// and no champion profile has one — so this page loses nothing to anonymisation.
export default async function DemoDraftChampionsPage() {
  const source = () => demoSource(createPublicClient());
  const version = await getLatestVersion();

  const [championMap, functionTags, profiles, counters] = await Promise.all([
    getChampionMap(version),
    cachedDemoLoad("draft-tags-function", () => loadDraftTags(source(), "function")),
    cachedDemoLoad("draft-profiles", async () => [
      ...(await loadChampionProfiles(source())).values(),
    ]),
    cachedDemoLoad("draft-counters", () => loadChampionCounters(source())),
  ]);

  return (
    <ChampionProfileTable
      champions={realChampions(championMap)}
      version={version}
      functionTags={functionTags}
      profiles={profiles}
      counters={counters}
      readOnly
    />
  );
}
