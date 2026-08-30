import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadTeamGames } from "@/lib/team/queries";
import { authorsByUserId, labelAuthors, notesByGame, threadNotes } from "@/lib/team/notes";
import { loadTeamHistoryRows } from "@/lib/loaders/team-history";
import {
  buildFlexHistory,
  buildTeamMatchHistory,
  filterHistory,
  historyViewCounts,
  mergeHistory,
  parseHistoryView,
} from "@/lib/team/history";
import { TeamHistoryView } from "@/components/team/views/matches-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

// user_id rides along purely to put a name on each note's author — see
// lib/team/notes.ts for why that's resolved at render time.
type RosterRow = { id: string; slug: string; display_name: string; user_id: string | null };

export default async function TeamMatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: viewParam } = await searchParams;
  const view = parseHistoryView(viewParam);
  const supabase = await createClient();

  const [games, flexRows, rosterResult, version, session] = await Promise.all([
    loadTeamGames(privateSource(supabase)),
    loadTeamHistoryRows(supabase),
    supabase.from("players").select("id, slug, display_name, user_id").returns<RosterRow[]>(),
    getLatestVersion(),
    getSession(),
  ]);

  const entries = mergeHistory(buildFlexHistory(flexRows.flex), buildTeamMatchHistory(games));
  // Both sources empty, not just the hand-entered one: a roster with flex games
  // and no scrims yet has a history, and being told to add its first series
  // would be wrong about the page it is looking at.
  if (entries.length === 0) return <TeamMatchEmptyState canAdd />;

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
      entries={filterHistory(entries, view)}
      counts={historyViewCounts(entries)}
      view={view}
      version={version}
      championMap={championMap}
      playerNames={playerNames}
      // Flex rows get no thread: notes hang off a team_games row, and a Riot
      // match has none. The per-player note on a flex game lives where it
      // always has, on the participant row at /matches.
      notesFor={(entry) =>
        entry.source === "team"
          ? threadNotes(labelAuthors(notes.get(entry.game.id) ?? [], authors))
          : undefined
      }
      currentUserId={session?.user.id ?? null}
    />
  );
}
