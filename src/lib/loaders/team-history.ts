// The read behind the team match history — /matches.
//
// Two sources, and only one of them is a query this file makes. Team matches
// come back whole from lib/team/queries.ts, which every page in the section
// already uses; what's added here is the flex side, which lives in the ordinary
// match tables and is reached through the flex-scoped participant view
// (migration 024) rather than through a queue filter anybody has to remember.
//
// Same fetch/build split as every other loader here, for the reason
// every loader here follows: the half that gets
// cached returns plain arrays and nothing with a Map in it.

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { privateSource, type DataSource } from "@/lib/data-source";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FlexHistoryInput } from "@/lib/team/history";

/**
 * Every participant of every flex match, not just the tracked ones.
 *
 * The untracked half is the enemy composition, which is half of what the page
 * renders — and, before that, it is what makes the sides answerable at all.
 */
const PARTICIPANT_COLUMNS =
  // `id` rides along only as the tie-break that makes the paged read's order
  // total; nothing downstream reads it.
  "id, match_id, player_id, team_id, team_position, champion_id, champion_name, win, " +
  "kills, deaths, assists, total_cs";

/**
 * The match columns each row needs, flattened afterwards.
 *
 * Two of them are private-only and for opposite reasons. `riot_match_id` is the
 * single field that identifies a whole lobby. The ban arrays
 * are harmless but were added to `matches` after that view was written, and a
 * view's column list is fixed at creation, so they are not in it either.
 */
const MATCH_COLUMNS =
  "riot_match_id, blue_bans, red_bans, game_creation, game_duration_seconds";

// The embed is named for whichever matches table was queried, and PostgREST
// returns it under that same name. loaders/players.ts and
// loaders/team-overview.ts hit the same thing and document it.
const flexColumns = (source: DataSource) =>
  `${PARTICIPANT_COLUMNS}, ${source.table("matches")}!inner(${MATCH_COLUMNS})`;

type MatchEmbed = {
  riot_match_id?: string | null;
  blue_bans?: number[] | null;
  red_bans?: number[] | null;
  game_creation: string;
  game_duration_seconds: number;
} | null;

type FlexRow = Omit<
  FlexHistoryInput,
  "game_creation" | "game_duration_seconds" | "riot_match_id" | "blue_bans" | "red_bans"
>;

export type TeamHistoryRows = { flex: FlexHistoryInput[] };

export async function fetchTeamHistoryRows(source: DataSource): Promise<TeamHistoryRows> {
  const matchesTable = source.table("matches");

  const raw = await fetchAllRows<FlexRow>((from, to) =>
    source.supabase
      .from(source.table("match_participants"))
      .select(flexColumns(source))
      // A total order. `.range()` paging over an ambiguous sort silently
      // duplicates and drops rows — the same trap lib/team/queries.ts documents,
      // and it would show up here as a five-man team with a champion missing.
      .order("match_id")
      .order("id")
      .range(from, to)
      .returns<FlexRow[]>(),
  );

  const flex: FlexHistoryInput[] = [];
  for (const row of raw) {
    const embedded = (row as unknown as Record<string, MatchEmbed>)[matchesTable];
    // A row whose match didn't come back can't be placed in time. The inner
    // join makes this unreachable; the types don't know that.
    if (!embedded) continue;
    flex.push({
      ...row,
      game_creation: embedded.game_creation,
      game_duration_seconds: embedded.game_duration_seconds,
      riot_match_id: embedded.riot_match_id ?? null,
      // Empty means "not recorded", and the row renders no ban strip at all
      // rather than five empty boxes claiming nobody banned.
      blue_bans: embedded.blue_bans ?? [],
      red_bans: embedded.red_bans ?? [],
    });
  }

  return { flex };
}

/** The private read. Flex-scoped, so no other queue can reach this page. */
export async function loadTeamHistoryRows(
  supabase: SupabaseClient,
): Promise<TeamHistoryRows> {
  return fetchTeamHistoryRows(privateSource(supabase, "flex"));
}
