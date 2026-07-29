import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RiotApiError,
  getRankedSoloMatchIds,
  getMatchById,
  getRankedSoloEntry,
} from "@/lib/riot";

// Games before this date are out of scope (docs/01_PRD.md §4.6) — the app's
// stated tracking start, not a ranked reset.
const TRACKING_START_DATE = new Date("2026-07-29T00:00:00Z");

const MAX_MATCH_IDS_PER_PLAYER = 200; // pagination safety cap, see docs/04_RIOT_API_INTEGRATION.md §3
const MATCH_ID_PAGE_SIZE = 20;
const RIOT_CALL_DELAY_MS = 75; // cheap insurance against the 20 req/s limit

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Player = {
  id: string; // == riot_puuid, players.id is keyed by the Riot account's puuid
  platform: string;
};

export type SyncSummary = {
  playersProcessed: number;
  newMatches: number;
  excludedMatches: number;
};

export class RiotKeyInvalidError extends Error {}

export async function runSync(admin: SupabaseClient): Promise<SyncSummary> {
  const { data: syncStateRow, error: syncStateError } = await admin
    .from("sync_state")
    .select("riot_api_key")
    .eq("id", 1)
    .single();

  if (syncStateError || !syncStateRow?.riot_api_key) {
    throw new Error("No Riot API key set in sync_state.");
  }
  const apiKey = syncStateRow.riot_api_key as string;

  const { data: players, error: playersError } = await admin
    .from("players")
    .select("id, platform");
  if (playersError) throw new Error(playersError.message);

  const knownPlayerIds = new Set((players ?? []).map((p) => p.id as string));

  const summary: SyncSummary = { playersProcessed: 0, newMatches: 0, excludedMatches: 0 };
  // Tracked players touched by a genuinely new match this run — not just
  // whoever's loop happened to discover it, since a shared game links every
  // tracked participant regardless of which player's fetch found it first.
  const playersWithNewMatches = new Set<string>();

  for (const player of (players ?? []) as Player[]) {
    await syncPlayerMatches(admin, player, apiKey, knownPlayerIds, summary, playersWithNewMatches);
    await refreshPlayerRank(admin, player, apiKey);
    summary.playersProcessed += 1;
  }

  for (const playerId of playersWithNewMatches) {
    await admin
      .from("player_ai_summaries")
      .upsert({ player_id: playerId, stale: true }, { onConflict: "player_id" });
  }

  return summary;
}

// Full re-fetch of one player's history since TRACKING_START_DATE, bypassing
// the normal incremental "stop at first known match" shortcut — used when a
// player's Riot ID (and therefore puuid) changes, since their new puuid has
// no overlap with anything already stored and needs a real backfill rather
// than waiting for the next daily sync to slowly discover it.
export async function backfillPlayerHistory(
  admin: SupabaseClient,
  playerId: string,
): Promise<SyncSummary> {
  const { data: syncStateRow, error: syncStateError } = await admin
    .from("sync_state")
    .select("riot_api_key")
    .eq("id", 1)
    .single();

  if (syncStateError || !syncStateRow?.riot_api_key) {
    throw new Error("No Riot API key set in sync_state.");
  }
  const apiKey = syncStateRow.riot_api_key as string;

  const { data: players, error: playersError } = await admin
    .from("players")
    .select("id, platform");
  if (playersError) throw new Error(playersError.message);

  const player = (players ?? []).find((p) => p.id === playerId) as Player | undefined;
  if (!player) throw new Error("Player not found.");

  const knownPlayerIds = new Set((players ?? []).map((p) => p.id as string));

  const summary: SyncSummary = { playersProcessed: 0, newMatches: 0, excludedMatches: 0 };
  const playersWithNewMatches = new Set<string>();

  await syncPlayerMatches(admin, player, apiKey, knownPlayerIds, summary, playersWithNewMatches);
  await refreshPlayerRank(admin, player, apiKey);
  summary.playersProcessed = 1;

  for (const touchedId of playersWithNewMatches) {
    await admin
      .from("player_ai_summaries")
      .upsert({ player_id: touchedId, stale: true }, { onConflict: "player_id" });
  }

  return summary;
}

async function syncPlayerMatches(
  admin: SupabaseClient,
  player: Player,
  apiKey: string,
  knownPlayerIds: Set<string>,
  summary: SyncSummary,
  playersWithNewMatches: Set<string>,
) {
  let start = 0;

  while (start < MAX_MATCH_IDS_PER_PLAYER) {
    await sleep(RIOT_CALL_DELAY_MS);
    let matchIds: string[];
    try {
      matchIds = await getRankedSoloMatchIds(player.id, apiKey, {
        start,
        count: MATCH_ID_PAGE_SIZE,
      });
    } catch (e) {
      throw toSyncError(e);
    }

    if (matchIds.length === 0) return;

    for (const matchId of matchIds) {
      const { data: existing } = await admin
        .from("matches")
        .select("id")
        .eq("riot_match_id", matchId)
        .maybeSingle();

      // Known edge case: if this player was added to the roster after a
      // teammate's sync already recorded a shared match, this player's own
      // older unshared matches past that point won't backfill. Acceptable
      // for MVP — see docs/06_ROADMAP.md Phase 2/3 ordering.
      if (existing) return;

      await sleep(RIOT_CALL_DELAY_MS);
      let match;
      try {
        match = await getMatchById(matchId, apiKey);
      } catch (e) {
        throw toSyncError(e);
      }

      if (new Date(match.info.gameCreation) < TRACKING_START_DATE) return;
      if (match.info.queueId !== 420) continue;

      const excluded = match.info.participants.some((p) => p.gameEndedInEarlySurrender);

      const { data: insertedMatch, error: insertMatchError } = await admin
        .from("matches")
        .insert({
          riot_match_id: matchId,
          queue_id: match.info.queueId,
          game_creation: new Date(match.info.gameCreation).toISOString(),
          game_duration_seconds: match.info.gameDuration,
          game_version: match.info.gameVersion,
          excluded,
        })
        .select("id")
        .single();

      if (insertMatchError) {
        // Another player's loop in this same run just inserted the same shared match.
        if (insertMatchError.code === "23505") continue;
        throw new Error(insertMatchError.message);
      }

      if (excluded) {
        summary.excludedMatches += 1;
        continue;
      }

      const participantRows = match.info.participants.map((p) => ({
        match_id: insertedMatch.id,
        player_id: knownPlayerIds.has(p.puuid) ? p.puuid : null,
        puuid: p.puuid,
        riot_game_name: p.riotIdGameName ?? null,
        riot_tag_line: p.riotIdTagline ?? null,
        team_id: p.teamId,
        team_position: p.teamPosition || null,
        champion_id: p.championId,
        champion_name: p.championName,
        win: p.win,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        damage_dealt_to_champions: p.totalDamageDealtToChampions,
        gold_earned: p.goldEarned,
        total_minions_killed: p.totalMinionsKilled,
        neutral_minions_killed: p.neutralMinionsKilled,
      }));

      const { error: insertParticipantsError } = await admin
        .from("match_participants")
        .insert(participantRows);
      if (insertParticipantsError) throw new Error(insertParticipantsError.message);

      for (const row of participantRows) {
        if (row.player_id) playersWithNewMatches.add(row.player_id);
      }

      summary.newMatches += 1;
    }

    if (matchIds.length < MATCH_ID_PAGE_SIZE) return;
    start += MATCH_ID_PAGE_SIZE;
  }
}

async function refreshPlayerRank(admin: SupabaseClient, player: Player, apiKey: string) {
  await sleep(RIOT_CALL_DELAY_MS);
  let entry;
  try {
    entry = await getRankedSoloEntry(player.id, player.platform, apiKey);
  } catch (e) {
    throw toSyncError(e);
  }

  // wins/losses are this app's own tracked record (since TRACKING_START_DATE),
  // not Riot's live ranked-season totals — every row here is already within
  // that window since syncPlayerMatches refuses to insert anything older.
  const { data: participantRows, error: participantsError } = await admin
    .from("match_participants")
    .select("win")
    .eq("player_id", player.id);
  if (participantsError) throw new Error(participantsError.message);
  const wins = (participantRows ?? []).filter((r) => r.win).length;
  const losses = (participantRows ?? []).length - wins;

  const { error } = await admin
    .from("players")
    .update({
      tier: entry?.tier ?? null,
      division: entry?.rank ?? null,
      league_points: entry?.leaguePoints ?? null,
      wins,
      losses,
      rank_updated_at: new Date().toISOString(),
    })
    .eq("id", player.id);
  if (error) throw new Error(error.message);
}

function toSyncError(e: unknown) {
  if (e instanceof RiotApiError && (e.status === 401 || e.status === 403)) {
    return new RiotKeyInvalidError(e.message);
  }
  return e instanceof Error ? e : new Error("Unknown Riot API error");
}
