import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import {
  loadChampionCounters,
  loadChampionProfiles,
  loadDraftComps,
  loadDraftTags,
} from "@/lib/draft/queries";
import { DraftSimulator } from "@/components/draft/draft-simulator";

export const dynamic = "force-dynamic";

// The most interactive page in the demo, and the one that needed the least done
// to it: the board is sessionStorage (ADR-033) and never touches the database,
// so a signed-out visitor gets the real thing — drafting, fearless tracking
// across a series, the reference panel, and the PNG export. `readOnly` removes
// only the two buttons that would have written a comp back.
export default async function DemoDraftPage() {
  const source = () => demoSource(createPublicClient());
  const version = await getLatestVersion();

  const [championMap, profiles, winConditionTags, functionTags, counters, comps] =
    await Promise.all([
      getChampionMap(version),
      cachedDemoLoad("draft-profiles", async () => [
        ...(await loadChampionProfiles(source())).values(),
      ]),
      cachedDemoLoad("draft-tags-wincon", () => loadDraftTags(source(), "win_condition")),
      cachedDemoLoad("draft-tags-function", () => loadDraftTags(source(), "function")),
      cachedDemoLoad("draft-counters", () => loadChampionCounters(source())),
      cachedDemoLoad("draft-comps-all", () => loadDraftComps(source())),
    ]);

  return (
    <DraftSimulator
      champions={realChampions(championMap)}
      version={version}
      profiles={profiles}
      winConditionTags={winConditionTags}
      functionTags={functionTags}
      counters={counters}
      comps={comps}
      readOnly
    />
  );
}
