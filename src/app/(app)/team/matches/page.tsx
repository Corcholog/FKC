import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadTeamGames } from "@/lib/team/queries";
import { authorsByUserId, labelAuthors, notesByGame, threadNotes } from "@/lib/team/notes";
import { TeamHistoryView } from "@/components/team/views/matches-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

// user_id rides along purely to put a name on each note's author — see
// lib/team/notes.ts for why that's resolved at render time.
type RosterRow = { id: string; slug: string; display_name: string; user_id: string | null };

export default async function TeamMatchesPage() {
  const supabase = await createClient();

  const [games, rosterResult, version, session] = await Promise.all([
    loadTeamGames(privateSource(supabase)),
    supabase.from("players").select("id, slug, display_name, user_id").returns<RosterRow[]>(),
    getLatestVersion(),
    getSession(),
  ]);

  if (games.length === 0) return <TeamMatchEmptyState canAdd />;

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
    <TeamHistoryView
      games={games}
      version={version}
      championMap={championMap}
      playerNames={playerNames}
      notesFor={(game) => threadNotes(labelAuthors(notes.get(game.id) ?? [], authors))}
      currentUserId={session?.user.id ?? null}
    />
  );
}
