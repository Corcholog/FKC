import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getChampionList, getLatestVersion } from "@/lib/ddragon";
import { DEFAULT_LANE, mainLane } from "@/lib/lolalytics";
import { Navbar } from "@/components/navbar";
import { KeyExpiredBanner } from "@/components/key-expired-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data: state }, session, version] = await Promise.all([
    supabase.from("sync_state").select("riot_key_valid, last_sync_status").eq("id", 1).single(),
    getSession(),
    getLatestVersion(),
  ]);
  // Both DDragon fetches are revalidated daily, so this is a cache read on
  // every render but the first of the day.
  const champions = await getChampionList(version);

  // One column over the signed-in player's own rows, to prefill the matchup
  // lookup with the role they actually queue for. Unordered on purpose: it's a
  // count over their whole history, so it can't shuffle between navigations.
  const { data: rolesPlayed } = session?.player
    ? await supabase
        .from("match_participants")
        .select("team_position")
        .eq("player_id", session.player.id)
        .returns<{ team_position: string | null }[]>()
    : { data: null };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Navbar
        initialSyncing={state?.last_sync_status === "running"}
        accountLabel={session?.player?.display_name ?? session?.user.email ?? null}
        champions={champions}
        ddragonVersion={version}
        mainLane={rolesPlayed ? mainLane(rolesPlayed.map((r) => r.team_position)) : DEFAULT_LANE}
      />
      {state && !state.riot_key_valid && <KeyExpiredBanner />}
      {children}
    </div>
  );
}
