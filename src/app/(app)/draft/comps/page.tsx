import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadDraftComps, loadDraftTags } from "@/lib/draft/queries";
import { CompList } from "@/components/draft/comp-list";

export default async function DraftCompsPage() {
  const supabase = await createClient();
  const version = await getLatestVersion();

  const [championMap, comps, winConditionTags] = await Promise.all([
    getChampionMap(version),
    loadDraftComps(supabase, { kind: "comp" }),
    loadDraftTags(supabase, "win_condition"),
  ]);

  return (
    <CompList
      kind="comp"
      comps={comps}
      champions={realChampions(championMap)}
      version={version}
      winConditionTags={winConditionTags}
    />
  );
}
