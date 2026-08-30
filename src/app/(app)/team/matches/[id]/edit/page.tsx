import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { loadCompetitions, loadOpponents, loadSeries } from "@/lib/team/queries";
import { privateSource } from "@/lib/data-source";
import { TEAM_ROLES, type TeamRole } from "@/lib/team/types";
import { gameStateFromView } from "@/components/team/draft-form-state";
import { TeamSeriesForm } from "@/components/team/series-form";

// The same form the series was entered with, loaded with what's stored. See
// updateTeamSeries for why an edit rewrites the games in place instead of
// replacing them: their note threads hang off the game rows.

type RosterRow = {
  id: string;
  display_name: string;
  /** Only used to recognise our team inside an imported replay. */
  riot_game_name: string;
  riot_tag_line: string;
};

/**
 * Who to preselect if a game is added to *this* series — its own game 1.
 *
 * The new-scrim form has to guess a lineup from history; here there's no need
 * to guess. Whoever played game 1 is who a game 4 entered later was played
 * with, substitutes included.
 */
function lineupOf(picks: { ally: boolean; team_position: string; player_id: string | null }[]) {
  const lineup = Object.fromEntries(TEAM_ROLES.map((role) => [role, null])) as Record<
    TeamRole,
    string | null
  >;

  for (const pick of picks) {
    if (!pick.ally || !pick.player_id) continue;
    if ((TEAM_ROLES as readonly string[]).includes(pick.team_position)) {
      lineup[pick.team_position as TeamRole] = pick.player_id;
    }
  }
  return lineup;
}

export default async function EditTeamSeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [games, { data: roster }, opponents, competitions, version] = await Promise.all([
    loadSeries(privateSource(supabase), id),
    supabase
      .from("players")
      .select("id, display_name, riot_game_name, riot_tag_line")
      .order("display_name")
      .returns<RosterRow[]>(),
    loadOpponents(privateSource(supabase)),
    loadCompetitions(privateSource(supabase)),
    getLatestVersion(),
  ]);

  // Same as the series page: a series always has at least one game, so nothing
  // here means a bad id rather than an empty series.
  if (games.length === 0) notFound();

  const championMap = await getChampionMap(version);
  const { series, opponent } = games[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/team/matches/${series.id}`}
          className="flex w-fit items-center gap-1.5 text-sm text-grey-mid transition-colors hover:text-gold-bright"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {opponent.name}
        </Link>
        <p className="text-xs text-grey-mid">
          Editing the {series.played_on} series. Notes written on a game aren&apos;t here —
          they&apos;re a thread on the series page, and each author edits their own.
        </p>
      </div>

      <TeamSeriesForm
        opponents={opponents}
        roster={roster ?? []}
        defaultLineup={lineupOf(games[0].picks)}
        champions={realChampions(championMap)}
        version={version}
        competitions={competitions}
        editing={{
          id: series.id,
          opponentId: series.opponent_id,
          playedOn: series.played_on,
          kind: series.kind,
          fearless: series.fearless,
          notes: series.notes ?? "",
          competitionId: series.competition_id,
          stage: series.stage,
          games: games.map(gameStateFromView),
        }}
      />
    </div>
  );
}
