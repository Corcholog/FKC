// The flex half of the team overview — /team.
//
// Team matches come from lib/team/queries.ts, which already loads everything a
// page in that section needs. This is the other source the overview counts:
// ranked flex, which lives in the ordinary match tables and is reached through
// the flex-scoped participant view (migration 024).
//
// Same fetch/build split as every other loader here, and for the reason
// every loader here follows: the half that gets
// cached returns plain arrays and the half that returns Maps runs after it.

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { privateSource, type DataSource } from "@/lib/data-source";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  flexAppearances,
  groupFlexGames,
  recordOf,
  type FlexGame,
  type FlexGameInput,
  type TeamRecord,
} from "@/lib/team/roster";
import {
  aggregatePlayerStats,
  type PlayerAgg,
  type PlayerStatInput,
} from "@/lib/player-stats";
import { fromParticipant, type UnifiedRow } from "@/lib/unified";

/**
 * Every column the two folds below need, from one read.
 *
 * The untracked five rows of each match are pulled deliberately: they are the
 * enemy composition, and they are what makes "which side were we on" answerable
 * at all.
 */
const PARTICIPANT_COLUMNS =
  // `id` rides along for the total order the paged read needs, nothing else.
  "id, match_id, player_id, team_id, team_position, champion_id, champion_name, win, " +
  "kills, deaths, assists, total_cs, damage_dealt_to_champions, gold_earned, vision_score";

// The embed is named for whichever matches table was queried, and PostgREST
// returns it under that same name. loaders/players.ts
// hits the same thing and documents it.
const flexColumns = (matchesTable: string) =>
  `${PARTICIPANT_COLUMNS}, ${matchesTable}!inner(game_creation, game_duration_seconds)`;

type MatchEmbed = { game_creation: string; game_duration_seconds: number } | null;

type FlexRow = Omit<FlexGameInput, "game_creation" | "game_duration_seconds"> & {
  team_position: string | null;
  champion_id: number;
  champion_name: string;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
  damage_dealt_to_champions: number;
  gold_earned: number | null;
  vision_score: number | null;
};

/** Flattened, so nothing downstream has to reach through the embed. */
export type FlexParticipantRow = FlexGameInput & {
  team_position: string | null;
  champion_id: number;
  champion_name: string;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
  damage_dealt_to_champions: number;
  gold_earned: number | null;
  vision_score: number | null;
};

export type TeamOverviewRows = { flex: FlexParticipantRow[] };

export type TeamOverviewFlex = {
  /** One entry per stored flex game, newest first. All of them are the team's. */
  games: FlexGame[];
  /** The team's flex record. */
  record: TeamRecord;
  /** Per-player flex aggregates. */
  byPlayer: Map<string, PlayerAgg>;
  /** How many of those games each player was in — who actually turns up. */
  appearances: Map<string, number>;
  /**
   * The same rows as unified rows, for the folds that mix flex with team
   * matches — champion pools, most of all.
   *
   * Handed over rather than aggregated here because the other half of the mix
   * lives in lib/team/queries.ts and this loader has never seen it. A UnifiedRow
   * is structurally a ChampionStatInput, so the caller concatenates and folds
   * once (ADR-046).
   */
  unified: UnifiedRow[];
};

export async function fetchTeamOverviewRows(source: DataSource): Promise<TeamOverviewRows> {
  const matchesTable = source.table("matches");

  const raw = await fetchAllRows<FlexRow>((from, to) =>
    source.supabase
      .from(source.table("match_participants"))
      .select(flexColumns(matchesTable))
      // A total order. `.range()` paging over an ambiguous sort silently
      // duplicates and drops rows — the same trap lib/team/queries.ts documents.
      .order("match_id")
      .order("id")
      .range(from, to)
      .returns<FlexRow[]>(),
  );

  const flex: FlexParticipantRow[] = [];
  for (const row of raw) {
    const embedded = (row as unknown as Record<string, MatchEmbed>)[matchesTable];
    // A row whose match didn't come back can't be placed in time, and every
    // fold below needs the duration. The inner join makes this unreachable;
    // the types don't know that.
    if (!embedded) continue;
    flex.push({
      ...row,
      game_creation: embedded.game_creation,
      game_duration_seconds: embedded.game_duration_seconds,
    });
  }

  return { flex };
}

export function buildTeamOverview(
  { flex }: TeamOverviewRows,
  teamPlayerIds: Set<string>,
): TeamOverviewFlex {
  const games = groupFlexGames(flex, teamPlayerIds);

  // Per-player aggregates cover every stored flex row, which is now the same
  // set: the sync keeps a flex game only when the team played it, so there is
  // no longer a wider pool of "some of the roster queued" games to decide
  // whether to include.
  const statRows: PlayerStatInput[] = flex
    .filter((row) => row.player_id)
    .map((row) => ({
      player_id: row.player_id,
      team_position: row.team_position,
      win: row.win,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      total_cs: row.total_cs,
      damage_dealt_to_champions: row.damage_dealt_to_champions,
      game_duration_seconds: row.game_duration_seconds,
      vision_score: row.vision_score,
    }));

  return {
    games,
    record: recordOf(games),
    byPlayer: aggregatePlayerStats(statRows),
    appearances: flexAppearances(games),
    unified: flex.filter((row) => row.player_id).map((row) => fromParticipant(row, "flexq")),
  };
}

/** The private read. Flex-scoped, so no other queue can reach these numbers. */
export async function loadTeamOverviewFlex(
  supabase: SupabaseClient,
  teamPlayerIds: Set<string>,
): Promise<TeamOverviewFlex> {
  return buildTeamOverview(
    await fetchTeamOverviewRows(privateSource(supabase, "flex")),
    teamPlayerIds,
  );
}
