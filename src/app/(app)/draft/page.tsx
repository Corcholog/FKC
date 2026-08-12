import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import {
  loadChampionCounters,
  loadChampionProfiles,
  loadDraftComps,
  loadDraftTags,
} from "@/lib/draft/queries";
import { DraftSimulator } from "@/components/draft/draft-simulator";

export default async function DraftPage() {
  const supabase = await createClient();
  const version = await getLatestVersion();

  // Six loads and not one of them filtered, which is deliberate: the reference
  // panel filters all of it in the browser against a board that changes on every
  // click, so loadDraftComps gets no options here on purpose. The reasoning, and
  // when it would stop being right, is at the top of lib/draft/context.ts.
  const [championMap, profiles, winConditionTags, functionTags, counters, comps] =
    await Promise.all([
      getChampionMap(version),
      loadChampionProfiles(supabase),
      loadDraftTags(supabase, "win_condition"),
      loadDraftTags(supabase, "function"),
      loadChampionCounters(supabase),
      loadDraftComps(supabase),
    ]);

  // Plain arrays, not the Maps these come as: the simulator is a client
  // component and a Map doesn't survive the boundary.
  return (
    <DraftSimulator
      champions={realChampions(championMap)}
      version={version}
      profiles={[...profiles.values()]}
      winConditionTags={winConditionTags}
      functionTags={functionTags}
      counters={counters}
      comps={comps}
    />
  );
}
