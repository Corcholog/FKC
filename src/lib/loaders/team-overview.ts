// The flex half of the team overview — /team and /demo/team.
//
// Team matches come from lib/team/queries.ts, which already loads everything a
// page in that section needs. This is the other source the overview counts:
// ranked flex, which lives in the ordinary match tables and is reached through
// the flex-scoped participant view (migration 024).
//
// Same fetch/build split as every other loader here, and for the reason
// demo-cache.ts spells out: a cached entry is serialized, so the half that gets
// cached returns plain arrays and the half that returns Maps runs after it.

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { demoSource, privateSource, type DataSource } from "@/lib/data-source";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  flexRecord,
  fullStackAppearances,
  splitFlexGames,
  type FlexParticipantInput,
  type FlexRecord,
  type FlexSplit,
} from "@/lib/flex-team";
import {
  aggregatePlayerStats,
  type PlayerAgg,
  type PlayerStatInput,
} from "@/lib/player-stats";

/**
 * Every column the two folds below need, from one read.
 *
 * The untracked six-to-nine rows of each match are pulled deliberately: they are
 * what makes "were all five on the same side" answerable, which is the whole
 * basis of splitFlexGames.
 */
const PARTICIPANT_COLUMNS =
  // `id` rides along for the total order the paged read needs, nothing else.
  "id, match_id, player_id, team_id, team_position, champion_id, champion_name, win, " +
  "kills, deaths, assists, total_cs, damage_dealt_to_champions, gold_earned, vision_score";

// The embed is named for whichever matches table was queried — demo_matches on
// the demo — and PostgREST returns it under that same name. loaders/roster.ts
// hits the same thing and documents it.
const flexColumns = (matchesTable: string) =>
  `${PARTICIPANT_COLUMNS}, ${matchesTable}!inner(game_creation, game_duration_seconds)`;

type MatchEmbed = { game_creation: string; game_duration_seconds: number } | null;

type FlexRow = Omit<FlexParticipantInput, "game_creation" | "game_duration_seconds"> & {
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
export type FlexParticipantRow = FlexParticipantInput & {
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
  split: FlexSplit;
  /** The team's record, from full-stack games only. See flex-team.ts. */
  record: FlexRecord;
  /** Per-player flex aggregates, over every flex game they were in. */
  byPlayer: Map<string, PlayerAgg>;
  /** How many full-stack games each player was in. */
  appearances: Map<string, number>;
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

export function buildTeamOverview({ flex }: TeamOverviewRows): TeamOverviewFlex {
  const split = splitFlexGames(flex);

  // Per-player aggregates use every flex game the player was in, not just the
  // full-stack ones: "how does this person play flex" is a question about them,
  // and dropping the games where only three of the roster queued would answer a
  // narrower one without saying so.
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
    split,
    record: flexRecord(split.fullStack),
    byPlayer: aggregatePlayerStats(statRows),
    appearances: fullStackAppearances(split.fullStack),
  };
}

/** The private read. Flex-scoped, so no other queue can reach these numbers. */
export async function loadTeamOverviewFlex(
  supabase: SupabaseClient,
): Promise<TeamOverviewFlex> {
  return buildTeamOverview(await fetchTeamOverviewRows(privateSource(supabase, "flex")));
}

export function demoFlexSource(supabase: SupabaseClient): DataSource {
  return demoSource(supabase, "flex");
}
