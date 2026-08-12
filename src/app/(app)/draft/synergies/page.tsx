import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadDraftComps, loadDraftTags } from "@/lib/draft/queries";
import { CompList } from "@/components/draft/comp-list";

// The same component as /draft/comps with a different kind — see CompList.
export default async function DraftSynergiesPage() {
  const supabase = await createClient();
  const version = await getLatestVersion();

  const [championMap, comps, winConditionTags] = await Promise.all([
    getChampionMap(version),
    loadDraftComps(supabase, { kind: "synergy" }),
    loadDraftTags(supabase, "win_condition"),
  ]);

  return (
    <CompList
      kind="synergy"
      comps={comps}
      champions={realChampions(championMap)}
      version={version}
      winConditionTags={winConditionTags}
    />
  );
}
