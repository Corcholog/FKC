import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { mainRole } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { loadOpponents } from "@/lib/scrims/queries";
import { privateSource } from "@/lib/data-source";
import { SCRIM_ROLES, type ScrimRole } from "@/lib/scrims/types";
import { ScrimSeriesForm } from "@/components/scrims/scrim-series-form";

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
): Promise<Record<ScrimRole, string | null>> {
  const empty = Object.fromEntries(SCRIM_ROLES.map((role) => [role, null])) as Record<
    ScrimRole,
    string | null
  >;
  if (roster.length === 0) return empty;

  const { data: lastSeries } = await supabase
    .from("scrim_series")
    .select("id")
    .order("played_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (lastSeries) {
    const { data: firstGame } = await supabase
      .from("scrim_games")
      .select("id")
      .eq("series_id", lastSeries.id)
      .order("game_number")
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (firstGame) {
      const { data: picks } = await supabase
        .from("scrim_picks")
        .select("team_position, player_id")
        .eq("game_id", firstGame.id)
        .eq("ally", true)
        .returns<LineupPickRow[]>();

      const lineup = { ...empty };
      let seeded = false;
      for (const pick of picks ?? []) {
        if (pick.player_id && (SCRIM_ROLES as readonly string[]).includes(pick.team_position)) {
          lineup[pick.team_position as ScrimRole] = pick.player_id;
          seeded = true;
        }
      }
      if (seeded) return lineup;
    }
  }

  // No scrim history yet — fall back to what soloq says each player is.
  const positions = await fetchAllRows<SoloqPositionRow>((from, to) =>
    supabase
      .from("match_participants")
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
    if (role && (SCRIM_ROLES as readonly string[]).includes(role) && !lineup[role as ScrimRole]) {
      lineup[role as ScrimRole] = player.id;
    }
  }
  return lineup;
}

export default async function NewScrimPage() {
  const supabase = await createClient();

  const [{ data: roster }, opponents, version] = await Promise.all([
    supabase
      .from("players")
      .select("id, display_name, riot_game_name, riot_tag_line")
      .order("display_name")
      .returns<RosterRow[]>(),
    loadOpponents(privateSource(supabase)),
    getLatestVersion(),
  ]);

  const players = roster ?? [];
  const [championMap, lineup] = await Promise.all([
    getChampionMap(version),
    seedLineup(supabase, players),
  ]);

  return (
    <ScrimSeriesForm
      opponents={opponents}
      roster={players}
      defaultLineup={lineup}
      champions={realChampions(championMap)}
      version={version}
    />
  );
}
