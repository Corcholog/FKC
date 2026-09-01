// Everything the three pages that render a <MatchRow> had in common.
//
// The dashboard, /matches and the player page each need the same thing: all ten
// participants of a match, split into the viewer's team and the enemy's, each
// sorted by role, plus whoever stood in the viewer's lane. All three carried a
// byte-identical 14-column select string, a byte-identical ParticipantRow type
// and a byte-identical composition block — about 120 duplicated lines, and three
// places that have to agree every time a column is added.
//
// Only the loader touches I/O; the grouping and the composition are pure and
// take rows the caller already has.

import { findLaneOpponent, sortByRole } from "@/lib/roles";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllByIds } from "@/lib/supabase/fetch-all";
import type { DataSource } from "@/lib/data-source";
// Type-only, so this stays a compile-time shape with no runtime import of the
// component. The type belongs with the thing that renders it.
import type { TeamComposChampion } from "@/components/match-row";

/**
 * The columns a match row needs. Kept as one exported string because the bug it
 * prevents is silent: a column added to one page's copy and not the others'
 * shows up as `undefined` at render, never as an error.
 */
export const MATCH_ROW_COLUMNS =
  "id, match_id, player_id, puuid, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, damage_dealt_to_champions, total_cs, vision_score";

export type MatchRowParticipant = {
  id: string;
  match_id: string;
  player_id: string | null;
  /**
   * The account that played it.
   *
   * Present on every participant row, tracked or not — it is the natural key of
   * a Riot account and what `player_accounts` is keyed by. What it buys a match
   * row is being able to say *which* of somebody's accounts a game was on,
   * which `player_id` cannot: that names the person.
   */
  puuid: string;
  team_id: number;
  team_position: string | null;
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damage_dealt_to_champions: number;
  total_cs: number;
  /** Null on games synced before migration 005. */
  vision_score: number | null;
};

/**
 * All ten participant rows for each of the given matches.
 *
 * Goes through fetchAllByIds because the id list is unbounded from the caller's
 * side and ten rows per match reaches PostgREST's 1000-row truncation at a
 * hundred matches — which returns a short answer with no error, and a match
 * missing four of its participants renders a four-man team rather than failing.
 */
export async function loadMatchRowParticipants(
  source: DataSource,
  matchIds: string[],
): Promise<MatchRowParticipant[]> {
  return fetchAllByIds<MatchRowParticipant>(matchIds, (chunk, from, to) =>
    source.supabase
      .from(source.table("match_participants"))
      .select(MATCH_ROW_COLUMNS)
      .in("match_id", chunk)
      .range(from, to)
      .returns<MatchRowParticipant[]>(),
  );
}

/** The ten rows of each match, keyed by match id. */
export function groupParticipantsByMatch(
  rows: MatchRowParticipant[],
): Map<string, MatchRowParticipant[]> {
  const byMatch = new Map<string, MatchRowParticipant[]>();
  for (const p of rows) {
    const list = byMatch.get(p.match_id) ?? [];
    list.push(p);
    byMatch.set(p.match_id, list);
  }
  return byMatch;
}

export type MatchComposition = {
  allies: TeamComposChampion[];
  enemies: TeamComposChampion[];
  /** Null when Riot left the viewer's team_position empty — autofill, disconnects. */
  opponent: TeamComposChampion | null;
};

/**
 * One match's two team strips, from the viewer's point of view.
 *
 * "Allies" is the viewer's own team including the viewer, which is why
 * TeamComposChampion carries `isSelf` — the strip highlights them rather than
 * leaving a gap where they should be.
 */
export function matchComposition(
  participants: MatchRowParticipant[],
  viewer: MatchRowParticipant,
): MatchComposition {
  const toChampion = (p: MatchRowParticipant): TeamComposChampion => ({
    championId: p.champion_id,
    championName: p.champion_name,
    kills: p.kills,
    isSelf: p.id === viewer.id,
  });

  const opponentParticipant = findLaneOpponent(participants, viewer);

  return {
    allies: sortByRole(participants.filter((p) => p.team_id === viewer.team_id)).map(toChampion),
    enemies: sortByRole(participants.filter((p) => p.team_id !== viewer.team_id)).map(toChampion),
    opponent: opponentParticipant ? toChampion(opponentParticipant) : null,
  };
}

/**
 * puuid → Riot ID, for accounts belonging to somebody who has more than one.
 *
 * Partial on purpose. A match row shows the account only when knowing it tells
 * the reader something, and for a player with a single account it never does —
 * so the map simply has no entry, and no surface needs a "does this person have
 * smurfs" branch of its own.
 *
 * One read of a five-row table, so it is not worth the ceremony of paging.
 */
export async function multiAccountNames(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("player_accounts")
    .select("puuid, player_id, riot_game_name, riot_tag_line")
    .returns<
      { puuid: string; player_id: string; riot_game_name: string; riot_tag_line: string }[]
    >();
  if (error) throw new Error(error.message);

  const countByPlayer = new Map<string, number>();
  for (const account of data ?? []) {
    countByPlayer.set(account.player_id, (countByPlayer.get(account.player_id) ?? 0) + 1);
  }

  return new Map(
    (data ?? [])
      .filter((account) => (countByPlayer.get(account.player_id) ?? 0) > 1)
      .map((account) => [
        account.puuid,
        `${account.riot_game_name}#${account.riot_tag_line}`,
      ]),
  );
}
