import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadDraftComps, loadDraftTags } from "@/lib/draft/queries";
import { CompList } from "@/components/draft/comp-list";

export const dynamic = "force-dynamic";

// The same component as /demo/draft/comps with a different kind — see CompList.
export default async function DemoDraftSynergiesPage() {
  const source = () => demoSource(createPublicClient());
  const version = await getLatestVersion();

  const [championMap, comps, winConditionTags] = await Promise.all([
    getChampionMap(version),
    cachedDemoLoad("draft-comps-synergy", () => loadDraftComps(source(), { kind: "synergy" })),
    cachedDemoLoad("draft-tags-wincon", () => loadDraftTags(source(), "win_condition")),
  ]);

  return (
    <CompList
      kind="synergy"
      comps={comps}
      champions={realChampions(championMap)}
      version={version}
      winConditionTags={winConditionTags}
      readOnly
    />
  );
}
