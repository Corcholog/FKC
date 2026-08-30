import { createClient } from "@/lib/supabase/server";
import { optional } from "@/lib/supabase/read";
import { getSession } from "@/lib/auth";
import { SOLOQ_PARTICIPANTS } from "@/lib/data-source";
import { getChampionList, getLatestVersion } from "@/lib/ddragon";
import { DEFAULT_LANE, mainLane } from "@/lib/lolalytics";
import { Navbar } from "@/components/navbar";
import { KeyExpiredBanner } from "@/components/key-expired-banner";

// How many of the signed-in player's rows the navbar's lane prefill looks at.
//
// This is a mode over team_position, and the mode of a 500-row sample is the
// same lane as the mode of the full history in any realistic case — so unlike
// the stats pages, truncation here is harmless and the read doesn't need
// fetch-all's paging. What it does need is a bound, because this runs in the
// layout: it was previously an unbounded select over the player's entire
// history on every navigation to every page.
const LANE_SAMPLE_SIZE = 500;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // Awaited first because the roles query below needs session.player. getSession
  // is cache()d, so this costs nothing the rest of the render doesn't already pay.
  const session = await getSession();

  const [stateResult, version, rolesResult] = await Promise.all([
    supabase.from("sync_state").select("riot_key_valid, last_sync_status").eq("id", 1).single(),
    getLatestVersion(),
    // Ordered by id rather than left unordered: a LIMIT without an ORDER BY
    // gives an arbitrary subset that Postgres is free to return differently
    // between calls, which would make the prefilled lane flicker between
    // navigations. id is the primary key, so this is a stable sample.
    session?.player
      ? supabase
          .from(SOLOQ_PARTICIPANTS)
          .select("team_position")
          .eq("player_id", session.player.id)
          .order("id", { ascending: true })
          .limit(LANE_SAMPLE_SIZE)
          .returns<{ team_position: string | null }[]>()
      : Promise.resolve({ data: null, error: null }),
  ]);

  // Both reads are `optional`, not `rows`, and the distinction matters more here
  // than anywhere else in the app: a layout that throws is caught by
  // global-error.tsx, not (app)/error.tsx — so one failed banner read would
  // replace the whole app with a full-screen error instead of a navbar missing
  // one badge. They still get logged, they just don't take the site down.
  const state = optional(stateResult, "sync state (navbar)", null);
  const rolesPlayed = optional(rolesResult, "lane sample (navbar)", null);

  // Both DDragon fetches are revalidated daily, so this is a cache read on
  // every render but the first of the day.
  const champions = await getChampionList(version);

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
