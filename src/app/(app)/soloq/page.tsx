import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { buildDashboard, fetchDashboardRows } from "@/lib/loaders/dashboard";
import { Leaderboards } from "@/components/dashboard/leaderboards";

// The solo queue tracker.
//
// A section of its own rather than a block on the home page, because it answers
// a different question. `/` is about the team — what we did together, in games
// we prepared for. This is about the five of them individually, on the ladder,
// where the only thing they share is a Discord.
//
// SoloQ only, and every metric here says so. These awards are built from the
// Riot detail columns — vision, damage, time dead, pings — and a hand-entered
// scrim records none of them, so widening this would rank five people on a
// sample only some of their games are in.
export default async function SoloqPage() {
  const supabase = await createClient();
  const dashboard = buildDashboard(await fetchDashboardRows(privateSource(supabase)));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">SoloQ</h1>
        <p className="text-sm text-grey-light">
          The ladder, one player at a time. Every number here is counted from ranked solo
          games only — the per-minute and per-game metrics need detail a scrim never records.
        </p>
      </div>

      <Leaderboards dashboard={dashboard} />
    </main>
  );
}
