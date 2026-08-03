import type { SupabaseClient } from "@supabase/supabase-js";
import { toParticipantRow } from "@/lib/participant-row";
import {
  RiotApiError,
  getRankedSoloMatchIds,
  getMatchById,
  getRankedSoloEntry,
  riotLimiter,
} from "@/lib/riot";

// Games before this date are out of scope (docs/01_PRD.md §4.6) — the app's
// stated tracking start, not a ranked reset. Expressed in UTC: 2026-07-29 12:00
// America/Argentina/Buenos Aires (UTC-3, no DST since 2009) = 2026-07-29T15:00:00Z.
const TRACKING_START_DATE = new Date("2026-07-29T15:00:00Z");

// Games shorter than this are excluded from statistics. Riot's own flag
// (gameEndedInEarlySurrender) only marks remakes, so a genuine 12-minute stomp
// arrives as an ordinary game whose per-minute rates and KDA are distorted by
// how little of it was played. Such a game still moves rank and LP — those come
// from Riot's league endpoint, not from anything stored here — but it is not
// counted as a win or a loss in the app's own tracked record.
//
// Strictly under 15:00, so an FF15 surrender (which lands at ~900-960s) still
// counts as the real loss it is.
const MIN_COUNTED_DURATION_SECONDS = 15 * 60;

const MAX_MATCH_IDS_PER_PLAYER = 200; // pagination safety cap, see docs/04_RIOT_API_INTEGRATION.md §3
const MATCH_ID_PAGE_SIZE = 20;

// The route sets maxDuration = 60. Stop well short of that: an overrun is a
// hard kill mid-insert, whereas stopping early just means the next run picks up
// where this one left off (see synced_through below).
const SYNC_BUDGET_MS = 50_000;

// Riot's 100 req/2min ceiling means a call costs ~1.2s of wall clock once the
// burst allowance is spent, so "is there time for one more?" has to account for
// how long the limiter will make us wait, not just how long a request takes.
const RIOT_CALL_BUDGET_MS = 2_000;

// A new rank point is written when the rank moved, or when the newest one is
// this old — so the graph still gets a daily point during a plateau, without
// the manual sync button spamming duplicates.
const RANK_HISTORY_MAX_GAP_MS = 20 * 60 * 60 * 1000;

type Player = {
  id: string; // == riot_puuid, players.id is keyed by the Riot account's puuid
  platform: string;
  synced_through: string | null;
};

const PLAYER_COLUMNS = "id, platform, synced_through";

export type SyncSummary = {
  playersProcessed: number;
  newMatches: number;
  excludedMatches: number;
  // True when the time budget ran out before every player's history was walked.
  // Not an error — no cursor was advanced past what was actually covered, so
  // the next run resumes cleanly.
  partial: boolean;
};

export class RiotKeyInvalidError extends Error {}

// Tracks the shared wall-clock budget for one sync run.
class Deadline {
  private readonly endsAt: number;

  constructor(budgetMs: number) {
    this.endsAt = Date.now() + budgetMs;
  }

  // Is there room for another Riot call, including the wait the rate limiter
  // will impose before it?
  hasRoomForCall(): boolean {
    return Date.now() + riotLimiter.peekWaitMs() + RIOT_CALL_BUDGET_MS < this.endsAt;
  }
}

async function loadApiKey(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from("sync_state")
    .select("riot_api_key")
    .eq("id", 1)
    .single();

  if (error || !data?.riot_api_key) {
    throw new Error("No Riot API key set in sync_state.");
  }
  return data.riot_api_key as string;
}

export async function runSync(admin: SupabaseClient): Promise<SyncSummary> {
  const apiKey = await loadApiKey(admin);
  const deadline = new Deadline(SYNC_BUDGET_MS);

  const { data: playerRows, error: playersError } = await admin
    .from("players")
    .select(PLAYER_COLUMNS);
  if (playersError) throw new Error(playersError.message);

  const players = (playerRows ?? []) as Player[];
  const knownPlayerIds = new Set(players.map((p) => p.id));

  const summary: SyncSummary = {
    playersProcessed: 0,
    newMatches: 0,
    excludedMatches: 0,
    partial: false,
  };
  // Tracked players touched by a genuinely new match this run — not just
  // whoever's loop happened to discover it, since a shared game links every
  // tracked participant regardless of which player's fetch found it first.
  const playersWithNewMatches = new Set<string>();

  // Ranks first, deliberately. They cost one call each and they're the only
  // part of the sync that writes an unrecoverable time series — if the budget
  // runs out, losing a day of match backfill is recoverable, losing a day of
  // the LP graph is not.
  for (const player of players) {
    await refreshPlayerRank(admin, player, apiKey);
  }

  for (const player of players) {
    if (!deadline.hasRoomForCall()) {
      summary.partial = true;
      break;
    }

    const complete = await syncPlayerMatches(
      admin,
      player,
      apiKey,
      knownPlayerIds,
      summary,
      playersWithNewMatches,
      deadline,
    );
    if (!complete) summary.partial = true;
    summary.playersProcessed += 1;
  }

  await markSummariesStale(admin, playersWithNewMatches);

  return summary;
}

// Full re-fetch of one player's history since TRACKING_START_DATE, bypassing
// the normal incremental shortcut — used when a player's Riot ID (and therefore
// puuid) changes, since their new puuid has no overlap with anything already
// stored and needs a real backfill rather than waiting for the next daily sync
// to slowly discover it.
export async function backfillPlayerHistory(
  admin: SupabaseClient,
  playerId: string,
): Promise<SyncSummary> {
  const apiKey = await loadApiKey(admin);
  const deadline = new Deadline(SYNC_BUDGET_MS);

  const { data: playerRows, error: playersError } = await admin
    .from("players")
    .select(PLAYER_COLUMNS);
  if (playersError) throw new Error(playersError.message);

  const players = (playerRows ?? []) as Player[];
  const player = players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found.");

  const knownPlayerIds = new Set(players.map((p) => p.id));

  const summary: SyncSummary = {
    playersProcessed: 1,
    newMatches: 0,
    excludedMatches: 0,
    partial: false,
  };
  const playersWithNewMatches = new Set<string>();

  // The cursor from the *previous* puuid says nothing about this one's coverage.
  const complete = await syncPlayerMatches(
    admin,
    { ...player, synced_through: null },
    apiKey,
    knownPlayerIds,
    summary,
    playersWithNewMatches,
    deadline,
  );
  if (!complete) summary.partial = true;

  await refreshPlayerRank(admin, player, apiKey);

  await markSummariesStale(admin, playersWithNewMatches);

  return summary;
}

// Flags whose summaries have something new to say. Nothing is generated here —
// Gemini's free tier is metered per day, so all generation happens in one
// scheduled batch (/api/summaries) that reads these flags.
//
// Summaries are opt-in (migration 009), and the filter belongs here rather than
// only in the batch: upserting a row for an opted-out player would recreate the
// row migration 009 just deleted, and their page would go from showing no card
// to showing an empty one after the first sync.
async function markSummariesStale(admin: SupabaseClient, playerIds: Set<string>) {
  if (playerIds.size === 0) return;

  const { data: enabled } = await admin
    .from("players")
    .select("id")
    .eq("ai_summary_enabled", true)
    .in("id", [...playerIds]);

  for (const row of enabled ?? []) {
    await admin
      .from("player_ai_summaries")
      .upsert({ player_id: row.id as string, stale: true }, { onConflict: "player_id" });
  }

  // Any new game changes the group picture too — duos, streaks, head-to-heads.
  await admin.from("team_ai_summary").update({ stale: true }).eq("id", 1);
}

export type RefetchSummary = {
  matchesUpdated: number;
  remaining: number;
  partial: boolean;
};

// Re-fetches match detail for matches already in the database and rewrites
// their participant rows. Only needed after a migration widens what's captured
// (see docs/migrations/005_participant_detail_columns.sql) — the normal sync
// never re-reads a match it already has.
//
// Resumable by design: matches are processed oldest-fetch-first and their
// fetched_at is bumped as they go, so an interrupted run leaves the unprocessed
// ones at the front of the queue and the next run continues rather than
// restarting.
export async function refetchMatchDetails(admin: SupabaseClient): Promise<RefetchSummary> {
  const apiKey = await loadApiKey(admin);
  const deadline = new Deadline(SYNC_BUDGET_MS);
  const startedAt = new Date().toISOString();

  const { data: playerRows, error: playersError } = await admin.from("players").select("id");
  if (playersError) throw new Error(playersError.message);
  const knownPlayerIds = new Set((playerRows ?? []).map((p) => p.id as string));

  const summary: RefetchSummary = { matchesUpdated: 0, remaining: 0, partial: false };

  for (;;) {
    // Excluded matches (remakes, early surrenders) have no participant rows to
    // update — upserting would materialise the very rows the exclusion exists
    // to avoid.
    const { data: pending, error: pendingError } = await admin
      .from("matches")
      .select("id, riot_match_id")
      .eq("excluded", false)
      .lt("fetched_at", startedAt)
      .order("fetched_at", { ascending: true })
      .limit(MATCH_ID_PAGE_SIZE);
    if (pendingError) throw new Error(pendingError.message);

    if (!pending || pending.length === 0) return summary;

    for (const row of pending) {
      if (!deadline.hasRoomForCall()) {
        summary.partial = true;
        summary.remaining = await countPendingRefetch(admin, startedAt);
        return summary;
      }

      let match;
      try {
        match = await getMatchById(row.riot_match_id as string, apiKey);
      } catch (e) {
        throw toSyncError(e);
      }

      const participantRows = match.info.participants.map((p) =>
        toParticipantRow(p, {
          matchId: row.id as string,
          isTracked: knownPlayerIds.has(p.puuid),
        }),
      );

      // (match_id, puuid) is unique, so this updates in place and preserves each
      // row's id — which match_notes references.
      const { error: upsertError } = await admin
        .from("match_participants")
        .upsert(participantRows, { onConflict: "match_id,puuid" });
      if (upsertError) throw new Error(upsertError.message);

      const { error: touchError } = await admin
        .from("matches")
        .update({ fetched_at: new Date().toISOString() })
        .eq("id", row.id);
      if (touchError) throw new Error(touchError.message);

      summary.matchesUpdated += 1;
    }
  }
}

async function countPendingRefetch(admin: SupabaseClient, startedAt: string): Promise<number> {
  const { count } = await admin
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("excluded", false)
    .lt("fetched_at", startedAt);
  return count ?? 0;
}

// Walks one player's match history backwards from newest. Returns true if it
// reached a confirmed-covered point (so the cursor can be advanced), false if
// it stopped early on the time budget or the pagination cap.
async function syncPlayerMatches(
  admin: SupabaseClient,
  player: Player,
  apiKey: string,
  knownPlayerIds: Set<string>,
  summary: SyncSummary,
  playersWithNewMatches: Set<string>,
  deadline: Deadline,
): Promise<boolean> {
  const syncedThrough = player.synced_through ? new Date(player.synced_through) : null;
  let start = 0;

  while (start < MAX_MATCH_IDS_PER_PLAYER) {
    if (!deadline.hasRoomForCall()) return false;

    let matchIds: string[];
    try {
      matchIds = await getRankedSoloMatchIds(player.id, apiKey, {
        start,
        count: MATCH_ID_PAGE_SIZE,
      });
    } catch (e) {
      throw toSyncError(e);
    }

    // Ran out of history entirely — coverage now extends to the tracking start.
    if (matchIds.length === 0) return await completeSync(admin, player);

    // One lookup per page instead of per match: the walk deliberately passes
    // *through* already-known matches now (rather than stopping at the first
    // one), so this runs on every id in the page, every run.
    const { data: existingRows, error: existingError } = await admin
      .from("matches")
      .select("riot_match_id, game_creation")
      .in("riot_match_id", matchIds);
    if (existingError) throw new Error(existingError.message);

    const existingByRiotId = new Map(
      (existingRows ?? []).map((m) => [m.riot_match_id as string, m.game_creation as string]),
    );

    for (const matchId of matchIds) {
      const existingCreation = existingByRiotId.get(matchId);

      if (existingCreation) {
        // Already stored. If it sits at or below the cursor, everything older
        // is confirmed covered and there is nothing left to walk.
        if (syncedThrough && new Date(existingCreation) <= syncedThrough) {
          return await completeSync(admin, player, syncedThrough);
        }
        // Known, but above the cursor — e.g. discovered through a teammate's
        // sync, or inserted by a run that was cut short before it could confirm
        // contiguity. Keep walking backwards to fill in whatever sits under it.
        continue;
      }

      if (!deadline.hasRoomForCall()) return false;

      let match;
      try {
        match = await getMatchById(matchId, apiKey);
      } catch (e) {
        throw toSyncError(e);
      }

      const gameCreation = new Date(match.info.gameCreation);
      if (gameCreation < TRACKING_START_DATE) return await completeSync(admin, player);

      // Excluded games still get a `matches` row and simply no participant
      // rows: an unrecorded match id is one the walk would re-fetch on every
      // future sync forever, and every read path joins through
      // match_participants!inner, so a match with none is invisible to stats.
      //
      // Off-queue games shouldn't reach us at all (the id query filters to
      // 420), but the check is cheap insurance against a Riot response quirk.
      const excluded =
        match.info.queueId !== 420 ||
        match.info.gameDuration < MIN_COUNTED_DURATION_SECONDS ||
        match.info.participants.some((p) => p.gameEndedInEarlySurrender);

      const { data: insertedMatch, error: insertMatchError } = await admin
        .from("matches")
        .insert({
          riot_match_id: matchId,
          queue_id: match.info.queueId,
          game_creation: gameCreation.toISOString(),
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

      const participantRows = match.info.participants.map((p) =>
        toParticipantRow(p, {
          matchId: insertedMatch.id,
          isTracked: knownPlayerIds.has(p.puuid),
        }),
      );

      const { error: insertParticipantsError } = await admin
        .from("match_participants")
        .insert(participantRows);
      if (insertParticipantsError) throw new Error(insertParticipantsError.message);

      for (const row of participantRows) {
        if (row.player_id) playersWithNewMatches.add(row.player_id);
      }

      summary.newMatches += 1;
    }

    // A short page is the end of the player's history.
    if (matchIds.length < MATCH_ID_PAGE_SIZE) return await completeSync(admin, player);
    start += MATCH_ID_PAGE_SIZE;
  }

  // Hit the pagination cap with history still left — not contiguous yet.
  return false;
}

// Records that this player's history is now covered contiguously from now back
// to `through` (the tracking start, unless an existing cursor was reached).
async function completeSync(admin: SupabaseClient, player: Player, through?: Date) {
  const cursor = through ?? TRACKING_START_DATE;
  const { error } = await admin
    .from("players")
    .update({ synced_through: cursor.toISOString() })
    .eq("id", player.id);
  if (error) throw new Error(error.message);
  return true;
}

async function refreshPlayerRank(admin: SupabaseClient, player: Player, apiKey: string) {
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

  const snapshot = {
    tier: entry?.tier ?? null,
    division: entry?.rank ?? null,
    league_points: entry?.leaguePoints ?? null,
    wins,
    losses,
  };

  const { error } = await admin
    .from("players")
    .update({ ...snapshot, rank_updated_at: new Date().toISOString() })
    .eq("id", player.id);
  if (error) throw new Error(error.message);

  await recordRankHistory(admin, player.id, snapshot);
}

type RankSnapshotRow = {
  tier: string | null;
  division: string | null;
  league_points: number | null;
  wins: number;
  losses: number;
};

// Appends to the LP time series, but only when there's something new to say.
// The navbar's manual sync button can be pressed any number of times a day, and
// a graph made of identical points is just noise.
async function recordRankHistory(
  admin: SupabaseClient,
  playerId: string,
  snapshot: RankSnapshotRow,
) {
  const { data: latest, error } = await admin
    .from("player_rank_history")
    .select("tier, division, league_points, recorded_at")
    .eq("player_id", playerId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (latest) {
    const unchanged =
      latest.tier === snapshot.tier &&
      latest.division === snapshot.division &&
      latest.league_points === snapshot.league_points;
    const recent =
      Date.now() - new Date(latest.recorded_at as string).getTime() < RANK_HISTORY_MAX_GAP_MS;

    if (unchanged && recent) return;
  }

  const { error: insertError } = await admin
    .from("player_rank_history")
    .insert({ player_id: playerId, ...snapshot });
  if (insertError) throw new Error(insertError.message);
}

function toSyncError(e: unknown) {
  if (e instanceof RiotApiError && (e.status === 401 || e.status === 403)) {
    return new RiotKeyInvalidError(e.message);
  }
  return e instanceof Error ? e : new Error("Unknown Riot API error");
}
