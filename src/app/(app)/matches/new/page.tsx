import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { mainRole } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { loadCompetitions, loadOpponents } from "@/lib/team/queries";
import { privateSource, SOLOQ_PARTICIPANTS } from "@/lib/data-source";
import { TEAM_ROLES, type TeamRole } from "@/lib/team/types";
import { TeamSeriesForm } from "@/components/team/series-form";

type RosterRow = {
  id: string;
  display_name: string;
  /** Only used to recognise our team inside an imported replay. */
  riot_game_name: string;
  riot_tag_line: string;
};

type LineupPickRow = { team_position: string; player_id: string | null };

type SoloqPositionRow = { player_id: string | null; team_position: string | null };

/**
 * Who to preselect in each ally slot.
 *
 * Two sources, in order of how much they actually know:
 *
 *  1. The most recent series' game 1. If a lineup was typed in last week it's
 *     almost certainly the lineup this week, substitutes included.
 *  2. Failing that, each player's soloq main role — the same `mainRole` call the
 *     navbar uses to prefill the matchup lane, so the two can't disagree.
 *
 * A role nobody claims is left empty rather than guessed at; the form's dropdown
 * is one click away.
 */
async function seedLineup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roster: RosterRow[],
): Promise<Record<TeamRole, string | null>> {
  const empty = Object.fromEntries(TEAM_ROLES.map((role) => [role, null])) as Record<
    TeamRole,
    string | null
  >;
  if (roster.length === 0) return empty;

  const { data: lastSeries } = await supabase
    .from("team_series")
    .select("id")
    .order("played_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (lastSeries) {
    const { data: firstGame } = await supabase
      .from("team_games")
      .select("id")
      .eq("series_id", lastSeries.id)
      .order("game_number")
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (firstGame) {
      const { data: picks } = await supabase
        .from("team_picks")
        .select("team_position, player_id")
        .eq("game_id", firstGame.id)
        .eq("ally", true)
        .returns<LineupPickRow[]>();

      const lineup = { ...empty };
      let seeded = false;
      for (const pick of picks ?? []) {
        if (pick.player_id && (TEAM_ROLES as readonly string[]).includes(pick.team_position)) {
          lineup[pick.team_position as TeamRole] = pick.player_id;
          seeded = true;
        }
      }
      if (seeded) return lineup;
    }
  }

  // No scrim history yet — fall back to what soloq says each player is.
  const positions = await fetchAllRows<SoloqPositionRow>((from, to) =>
    supabase
      .from(SOLOQ_PARTICIPANTS)
      .select("player_id, team_position")
      .not("player_id", "is", null)
      .range(from, to)
      .returns<SoloqPositionRow[]>(),
  );

  const byPlayer = new Map<string, (string | null)[]>();
  for (const row of positions) {
    if (!row.player_id) continue;
    const list = byPlayer.get(row.player_id) ?? [];
    list.push(row.team_position);
    byPlayer.set(row.player_id, list);
  }

  const lineup = { ...empty };
  for (const player of roster) {
    const role = mainRole(byPlayer.get(player.id) ?? []);
    // First claim wins: two mids means the second one picks their own slot,
    // which beats silently overwriting whoever was there.
    if (role && (TEAM_ROLES as readonly string[]).includes(role) && !lineup[role as TeamRole]) {
      lineup[role as TeamRole] = player.id;
    }
  }
  return lineup;
}

export default async function NewTeamSeriesPage() {
  const supabase = await createClient();

  const [{ data: roster }, opponents, version, competitions] = await Promise.all([
    supabase
      .from("players")
      .select("id, display_name, riot_game_name, riot_tag_line")
      .order("display_name")
      .returns<RosterRow[]>(),
    loadOpponents(privateSource(supabase)),
    getLatestVersion(),
    loadCompetitions(privateSource(supabase)),
  ]);

  const players = roster ?? [];
  const [championMap, lineup] = await Promise.all([
    getChampionMap(version),
    seedLineup(supabase, players),
  ]);

  // The page owns its container, as every page in this app does. The three
  // routes under /matches used to inherit one from the old /team section layout
  // and lost it when the routes flattened (ADR-050), which left the entry form
  // running edge to edge. 6xl rather than the list's 5xl: a game is five roles
  // and ten champion pickers wide.
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <TeamSeriesForm
        opponents={opponents}
        roster={players}
        defaultLineup={lineup}
        champions={realChampions(championMap)}
        version={version}
        competitions={competitions}
      />
    </main>
  );
}
