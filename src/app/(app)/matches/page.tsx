import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { notesByParticipant } from "@/lib/match-notes";
import { privateSource } from "@/lib/data-source";
import { loadTeamGames } from "@/lib/team/queries";
import { authorsByUserId, labelAuthors, notesByGame, threadNotes } from "@/lib/team/notes";
import { loadTeamHistoryRows } from "@/lib/loaders/team-history";
import { loadTeamRoster } from "@/lib/team/roster";
import {
  buildFlexHistory,
  buildTeamMatchHistory,
  filterHistory,
  historyViewCounts,
  mergeHistory,
  parseHistoryView,
} from "@/lib/team/history";
import { buildMatchesPage, fetchMatchesPageRows, parsePage } from "@/lib/loaders/matches";
import { multiAccountNames } from "@/lib/match-rows";
import { MatchViewTabs, SOLOQ_VIEW, type MatchesView } from "@/components/matches/match-view-tabs";
import { SoloqHistory } from "@/components/matches/soloq-history";
import { TeamHistoryView } from "@/components/team/views/matches-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

// Everything the team has played, under one filter.
//
// Two streams, and the filter says which one you are looking at. Four of the
// tabs are team games — one row per game, whichever record it came from — and
// the fifth is solo queue, which is one row per player per game and paginated.
// See components/matches/match-view-tabs.tsx for why they share a control.
//
// The team-game half is loaded on every view because the tab counts come from
// the unfiltered stream: a control whose options are derived from its own result
// is a dead end. The soloQ half is only read when it is the one being shown,
// because it is the paged one and its count comes back with the page.

// user_id rides along purely to put a name on each note's author — see
// lib/team/notes.ts for why that's resolved at render time.
type RosterRow = { id: string; slug: string; display_name: string; user_id: string | null };

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; player?: string; page?: string }>;
}) {
  const { view: viewParam, player: playerFilter, page: pageParam } = await searchParams;
  const soloq = viewParam === SOLOQ_VIEW;
  const view: MatchesView = soloq ? SOLOQ_VIEW : parseHistoryView(viewParam);
  const page = parsePage(pageParam);
  const supabase = await createClient();

  // The team decides which side of a flex game was ours, so it is resolved
  // first. It is deliberately *not* the name lookup below, which stays wide: a
  // substitute who played a scrim still needs their name rendered.
  const team = await loadTeamRoster(privateSource(supabase));
  const teamPlayerIds = new Set(team.map((m) => m.id));

  const [games, flexRows, rosterResult, version, session, soloqRows] = await Promise.all([
    loadTeamGames(privateSource(supabase)),
    loadTeamHistoryRows(supabase),
    supabase.from("players").select("id, slug, display_name, user_id").returns<RosterRow[]>(),
    getLatestVersion(),
    getSession(),
    fetchMatchesPageRows(privateSource(supabase, "solo"), {
      playerSlug: playerFilter ?? null,
      // Page 1 is read even when the soloQ view isn't showing, because its
      // `count: "exact"` is where the tab's number comes from. One page of
      // rows is the cheapest way to ask PostgREST for a count it will return
      // anyway.
      page: soloq ? page : 1,
    }),
  ]);

  const entries = mergeHistory(
    buildFlexHistory(flexRows.flex, teamPlayerIds),
    buildTeamMatchHistory(games),
  );
  const counts = historyViewCounts(entries);

  const soloqPage = buildMatchesPage(soloqRows, playerFilter ?? null);

  // Nothing on record at all, in either stream: the page has nothing to filter
  // and the useful thing to say is where a first series comes from.
  if (entries.length === 0 && soloqPage.totalMatches === 0) {
    return <TeamMatchEmptyState canAdd />;
  }

  // Page 1 always renders — an unplayed filter is a valid empty state, not a
  // 404. Anything past the end is a genuine 404.
  if (soloq && page > 1 && soloqPage.entries.length === 0) notFound();

  const championMap = await getChampionMap(version);
  const roster = rows(rosterResult, "roster");

  const tabs = <MatchViewTabs active={view} counts={counts} soloqCount={soloqPage.totalMatches} />;

  if (soloq) {
    // Notes for exactly the rows about to render. Eager rather than fetched on
    // expand, so a collapsed row can show its note count — otherwise annotated
    // games are invisible until you open every one of them.
    const [notesByParticipantId, accountNames] = await Promise.all([
      notesByParticipant(
        supabase,
        soloqPage.entries.map((e) => e.viewer.id),
      ),
      multiAccountNames(supabase),
    ]);

    return (
      <Shell tabs={tabs}>
        <SoloqHistory
          page={soloqPage}
          pageNumber={page}
          version={version}
          championMap={championMap}
          notesByParticipantId={notesByParticipantId}
          session={session}
          accountNames={accountNames}
        />
      </Shell>
    );
  }

  // Every team game on this page in one pass, rather than a query per card.
  const notes = await notesByGame(
    supabase,
    games.map((g) => g.id),
  );
  const playerNames = new Map(
    roster.map((p) => [p.id, { display_name: p.display_name, slug: p.slug }]),
  );
  const authors = authorsByUserId(roster);

  return (
    <Shell tabs={tabs}>
      <TeamHistoryView
        entries={filterHistory(entries, view === SOLOQ_VIEW ? "all" : view)}
        version={version}
        championMap={championMap}
        playerNames={playerNames}
        // Flex rows get no thread: notes hang off a team_games row, and a Riot
        // match has none. The per-player note on a flex game lives where it
        // always has, on the participant row in the soloQ view.
        notesFor={(entry) =>
          entry.source === "team"
            ? threadNotes(labelAuthors(notes.get(entry.game.id) ?? [], authors))
            : undefined
        }
        currentUserId={session?.user.id ?? null}
      />
    </Shell>
  );
}

function Shell({ tabs, children }: { tabs: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Matches</h1>
        <p className="text-sm text-grey-light">
          Every game on record. Scrims, friendlies and officials are entered by hand or read
          out of a replay; flex comes from Riot and sits beside them, one row per game rather
          than one per player. SoloQ is counted the other way round, a row each time one of us
          played — so the two numbers describe different things and will not add up.
        </p>
      </div>

      {tabs}

      {children}
    </main>
  );
}
