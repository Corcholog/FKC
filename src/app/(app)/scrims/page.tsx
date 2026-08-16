import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { rows } from "@/lib/supabase/read";
import { loadScrimGames } from "@/lib/scrims/queries";
import {
  ScrimsOverviewView,
  type ScrimsRosterRow,
} from "@/components/scrims/views/scrims-overview-view";
import { ScrimEmptyState } from "@/components/scrims/scrim-empty-state";

export default async function ScrimsOverviewPage() {
  const supabase = await createClient();

  const [games, rosterResult] = await Promise.all([
    loadScrimGames(privateSource(supabase)),
    supabase
      .from("players")
      .select("id, slug, display_name, avatar_url")
      .order("display_name")
      .returns<ScrimsRosterRow[]>(),
  ]);

  if (games.length === 0) return <ScrimEmptyState canAdd />;

  return <ScrimsOverviewView games={games} roster={rows(rosterResult, "roster")} />;
}
