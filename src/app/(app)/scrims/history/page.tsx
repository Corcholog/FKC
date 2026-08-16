import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadScrimGames } from "@/lib/scrims/queries";
import { authorsByUserId, labelAuthors, notesByGame, threadNotes } from "@/lib/scrims/notes";
import { ScrimHistoryView } from "@/components/scrims/views/scrim-history-view";
import { ScrimEmptyState } from "@/components/scrims/scrim-empty-state";

// user_id rides along purely to put a name on each note's author — see
// lib/scrims/notes.ts for why that's resolved at render time.
type RosterRow = { id: string; slug: string; display_name: string; user_id: string | null };

export default async function ScrimHistoryPage() {
  const supabase = await createClient();

  const [games, rosterResult, version, session] = await Promise.all([
    loadScrimGames(privateSource(supabase)),
    supabase.from("players").select("id, slug, display_name, user_id").returns<RosterRow[]>(),
    getLatestVersion(),
    getSession(),
  ]);

  if (games.length === 0) return <ScrimEmptyState canAdd />;

  // Every game on this page in one pass, rather than a query per card.
  const [championMap, notes] = await Promise.all([
    getChampionMap(version),
    notesByGame(
      supabase,
      games.map((g) => g.id),
    ),
  ]);

  const roster = rows(rosterResult, "roster");
  const playerNames = new Map(
    roster.map((p) => [p.id, { display_name: p.display_name, slug: p.slug }]),
  );
  const authors = authorsByUserId(roster);

  return (
    <ScrimHistoryView
      games={games}
      version={version}
      championMap={championMap}
      playerNames={playerNames}
      notesFor={(game) => threadNotes(labelAuthors(notes.get(game.id) ?? [], authors))}
      currentUserId={session?.user.id ?? null}
    />
  );
}
