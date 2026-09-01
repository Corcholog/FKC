import type { SupabaseClient } from "@supabase/supabase-js";
import { toParticipantRow } from "@/lib/participant-row";
import { formatRank, ladderPoints } from "@/lib/rank";
import {
  bansForTeam,
  isRiotKeyRejection,
  getMatchIds,
  getMatchById,
  getLeagueEntries,
  riotLimiter,
  type LeagueEntryDto,
} from "@/lib/riot";
import {
  CURSOR_COLUMN,
  QUEUE_FLEX,
  QUEUE_ID,
  TRACKED_QUEUES,
  TRACKED_QUEUE_IDS,
  TRACKING_START,
  TRACK_COLUMN,
  type TrackedQueue,
} from "@/lib/queues";
import { isFullStack } from "@/lib/team/roster";

// How old a game can be and still be worth announcing a multikill for.
//
// Sized to survive one missed cron (the job is daily) while still refusing to
// treat a backfill as news — adding an account walks its whole history, and
// every penta in it arrives as a fresh insert.
const MULTIKILL_MAX_AGE_MS = 48 * 60 * 60 * 1000;

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

const MAX_MATCH_IDS_PER_WALK = 200; // pagination safety cap, see docs/04_RIOT_API_INTEGRATION.md §3
const MATCH_ID_PAGE_SIZE = 20;

// The route sets maxDuration = 60. Stop well short of that: an overrun is a
// hard kill mid-insert, whereas stopping early just means the next run picks up
// where this one left off (see the cursors below).
const SYNC_BUDGET_MS = 50_000;

// Riot's 100 req/2min ceiling means a call costs ~1.2s of wall clock once the
// burst allowance is spent, so "is there time for one more?" has to account for
// how long the limiter will make us wait, not just how long a request takes.
const RIOT_CALL_BUDGET_MS = 2_000;

// A new rank point is written when the rank moved, or when the newest one is
// this old — so the graph still gets a daily point during a plateau, without
// the manual sync button spamming duplicates.
const RANK_HISTORY_MAX_GAP_MS = 20 * 60 * 60 * 1000;

/**
 * One Riot account, joined to the person who owns it.
 *
 * This is what the sync iterates now. It used to iterate players, because
 * players.id *was* the puuid — but a person can own several accounts, on
 * several platforms, and each one has its own match history, its own rank and
 * its own pair of cursors. The person is what the results are attributed to;
 * the account is what Riot is asked about.
 */
type Account = {
  puuid: string;
  player_id: string;
  platform: string;
  is_primary: boolean;
  track_solo: boolean;
  track_flex: boolean;
  synced_through_solo: string | null;
  synced_through_flex: string | null;
  /** Joined from players — needed for multikill and promotion messages. */
  display_name: string;
  /**
   * The owner's position on the main team, or null. Joined from players because
   * the flex gate below needs it per participant, and one embed is cheaper than
   * a second query the loop would have to keep in step.
   */
  team_role: string | null;
};

type PlayerEmbed = { display_name: string; team_role: string | null };

type AccountJoinRow = Omit<Account, "display_name" | "team_role"> & {
  players: PlayerEmbed | PlayerEmbed[];
};

const ACCOUNT_COLUMNS =
  "puuid, player_id, platform, is_primary, track_solo, track_flex, " +
  "synced_through_solo, synced_through_flex, players!inner(display_name, team_role)";

/**
 * A player crossing a tier or division boundary since the last sync.
 *
 * Measured on the *rolled-up* rank — the one the app displays — rather than per
 * account. Somebody climbing on a smurf hasn't been promoted as far as any page
 * in this app is concerned, and announcing it as if they had would be reporting
 * a number nothing shows.
 *
 * Collected rather than notified in place: this module owns the sync, and
 * pushing to an external service from inside it would put a second failure mode
 * (and a second timeout) in the middle of a time-budgeted loop. /api/sync sends
 * these once the run is safely finished.
 */
export type RankChange = {
  displayName: string;
  from: string;
  to: string;
  promoted: boolean;
};

/**
 * A tracked player's multikill in a match this run just recorded.
 *
 * `championName` is Riot's internal codename ("MonkeyKing"), the same value
 * stored on the row — resolving it to a display name needs the DDragon map, so
 * that happens at the notification boundary rather than here.
 */
export type Multikill = {
  kind: "penta" | "quadra";
  displayName: string;
  championName: string;
  championId: number;
  count: number;
  gameCreation: string;
};

export type SyncSummary = {
  /** Accounts whose match history was walked, not people. */
  accountsProcessed: number;
  playersProcessed: number;
  newMatches: number;
  /** The same total, split by queue — what the two sync buttons report back. */
  newMatchesByQueue: Record<TrackedQueue, number>;
  excludedMatches: number;
  rankChanges: RankChange[];
  multikills: Multikill[];
  /** Which queues this run was asked to cover. */
  queues: TrackedQueue[];
  /**
   * Queues whose every tracked account reached a proven-contiguous point. Only
   * these get their `sync_state.last_*_sync_at` stamped — a queue that ran out
   * of budget halfway is not "synced as of now".
   */
  completedQueues: TrackedQueue[];
  /**
   * Flex was asked for and dropped, because fewer than five people are on the
   * main team. Reported rather than left silent: "no flex arrived" and "flex
   * cannot arrive" look identical from outside, and only one of them is fixed
   * by pressing Sync again.
   */
  // True when the time budget ran out before every account's history was
  // walked. Not an error — no cursor was advanced past what was actually
  // covered, so the next run resumes cleanly.
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

/**
 * Every account, oldest-visit-first.
 *
 * The ordering is not cosmetic. The loop used to start at the same player every
 * run, which was invisible while the tracking window was a few weeks: one run
 * covered everybody. A backfill that spans several runs — flex reaches back to
 * June — turns that into starvation, where the first account is walked five
 * times and the fifth is never walked at all. Ordering by last_walked_at makes
 * the queue fair without any notion of priority.
 */
async function loadAccounts(admin: SupabaseClient): Promise<Account[]> {
  const { data, error } = await admin
    .from("player_accounts")
    .select(ACCOUNT_COLUMNS)
    .order("last_walked_at", { ascending: true, nullsFirst: true })
    // A total order, so two accounts never walked yet don't swap places between
    // runs and page each other out of the budget.
    .order("puuid", { ascending: true })
    .returns<AccountJoinRow[]>();
  if (error) throw new Error(error.message);

  return (data ?? []).map(({ players, ...account }) => {
    // PostgREST types a to-one embed as either shape depending on how it infers
    // the relationship; both are one row here because player_id is not null.
    const owner = Array.isArray(players) ? players[0] : players;
    return { ...account, display_name: owner.display_name, team_role: owner.team_role };
  });
}

export async function runSync(
  admin: SupabaseClient,
  { queues = TRACKED_QUEUES }: { queues?: TrackedQueue[] } = {},
): Promise<SyncSummary> {
  const apiKey = await loadApiKey(admin);
  const deadline = new Deadline(SYNC_BUDGET_MS);

  const accounts = await loadAccounts(admin);
  // A map, not a set: participant rows carry a puuid and need the person's id,
  // and multikill alerts need their display name. This is the lookup that
  // replaced comparing player_id directly against participant.puuid.
  const playersByPuuid = new Map(
    accounts.map((a) => [a.puuid, { playerId: a.player_id, displayName: a.display_name }]),
  );

  const summary: SyncSummary = {
    accountsProcessed: 0,
    playersProcessed: 0,
    newMatches: 0,
    newMatchesByQueue: { solo: 0, flex: 0 },
    excludedMatches: 0,
    rankChanges: [],
    multikills: [],
    queues,
    completedQueues: [],
    partial: false,
  };

  // Tracked players touched by a genuinely new match this run — not just
  // whoever's loop happened to discover it, since a shared game links every
  // tracked participant regardless of which account's fetch found it first.
  // This is what makes a five-man flex game cost one detail call for the whole
  // roster rather than five.
  const playersWithNewMatches = new Set<string>();

  // The team, by player id — the set the flex gate tests against. Every player
  // is on it since 028, so this cannot be short of five and the flex walk can
  // no longer be silently starved of a roster.
  const teamPlayerIds = new Set(accounts.map((a) => a.player_id));

  // Only accounts this run is actually about. Refreshing the rank of an account
  // whose only tracked queue wasn't asked for spends a Riot call on a number
  // nothing in this run will use.
  const inScope = accounts.filter((a) => queues.some((q) => a[TRACK_COLUMN[q]]));

  // Ranks first, deliberately. They cost one call each and they're the only
  // part of the sync that writes an unrecoverable time series — if the budget
  // runs out, losing a day of match backfill is recoverable, losing a day of
  // the LP graph is not.
  //
  // Budget-checked all the same. Priority decides who goes first; it doesn't
  // buy exemption from the clock.
  //
  // One call covers both queues: League-V4 returns every queue the account is
  // ranked in, so flex rank is free rather than a second round of calls.
  for (const account of inScope) {
    if (!deadline.hasRoomForCall()) {
      summary.partial = true;
      break;
    }
    await refreshAccountRank(admin, account, apiKey);
  }

  // Roll the accounts up onto their players, and notice who moved.
  //
  // Separate from the loop above because the displayed rank is a property of
  // the person, not of any one account: it is the best soloQ rank among their
  // accounts, so it can't be decided until every account has been refreshed.
  summary.rankChanges = await rollUpPlayerRanks(admin, accounts);

  const incompleteQueues = new Set<TrackedQueue>();

  outer: for (const account of inScope) {
    let walked = false;

    for (const queue of queues) {
      if (!account[TRACK_COLUMN[queue]]) continue;

      if (!deadline.hasRoomForCall()) {
        summary.partial = true;
        // Everything still unwalked stays unfinished, including this queue.
        for (const q of queues) incompleteQueues.add(q);
        break outer;
      }

      walked = true;
      const complete = await syncAccountQueue(
        admin,
        account,
        queue,
        apiKey,
        playersByPuuid,
        teamPlayerIds,
        summary,
        playersWithNewMatches,
        deadline,
      );
      if (!complete) {
        summary.partial = true;
        incompleteQueues.add(queue);
      }
    }

    if (walked) {
      await touchAccount(admin, account.puuid);
      summary.accountsProcessed += 1;
    }
  }

  summary.playersProcessed = new Set(inScope.map((a) => a.player_id)).size;
  summary.completedQueues = queues.filter((q) => !incompleteQueues.has(q));

  // Recount W/L for anyone whose history just grew.
  //
  // This exists because of the loop order above. refreshAccountRank runs in the
  // *first* loop — before the second loop inserts this run's new matches — and
  // the roll-up writes the counts it saw. So the totals are as of before those
  // inserts, and they stay that way until the next sync, which repeats the
  // mistake for whatever is new by then. The effect isn't transient staleness
  // between runs: a player who games every day sits permanently one sync behind
  // everywhere players.wins/losses is read.
  //
  // Recounting here rather than reordering the loops keeps ranks first, which
  // is deliberate and unrelated. These are Postgres counts, so they cost no
  // Riot calls and can't be rate-limited; the deadline doesn't gate them.
  for (const playerId of playersWithNewMatches) {
    const { wins, losses } = await countWinLoss(admin, playerId);
    const { error } = await admin.from("players").update({ wins, losses }).eq("id", playerId);
    if (error) throw new Error(error.message);
  }


  return summary;
}

/**
 * Full re-walk of one account's history, bypassing the incremental shortcut.
 *
 * Used when an account is newly attached to a player: nothing stored says
 * anything about its coverage, and waiting for the daily sync to discover it
 * 200 match ids at a time is not a backfill.
 */
export async function backfillAccountHistory(
  admin: SupabaseClient,
  puuid: string,
  { queues = TRACKED_QUEUES }: { queues?: TrackedQueue[] } = {},
): Promise<SyncSummary> {
  const apiKey = await loadApiKey(admin);
  const deadline = new Deadline(SYNC_BUDGET_MS);

  const accounts = await loadAccounts(admin);
  const account = accounts.find((a) => a.puuid === puuid);
  if (!account) throw new Error("Account not found.");

  const playersByPuuid = new Map(
    accounts.map((a) => [a.puuid, { playerId: a.player_id, displayName: a.display_name }]),
  );
  const teamPlayerIds = new Set(accounts.map((a) => a.player_id));

  const summary: SyncSummary = {
    accountsProcessed: 1,
    playersProcessed: 1,
    newMatches: 0,
    newMatchesByQueue: { solo: 0, flex: 0 },
    excludedMatches: 0,
    // Always empty here: this walks match history and never touches ranks.
    rankChanges: [],
    // A backfill replays old games, so anything it finds is history rather than
    // news. The age guard in syncAccountQueue keeps this empty in practice.
    multikills: [],
    queues,
    completedQueues: [],
    partial: false,
  };
  const playersWithNewMatches = new Set<string>();

  for (const queue of queues) {
    if (!account[TRACK_COLUMN[queue]]) continue;
    // Cursors forced to null: whatever is stored says nothing about an account
    // that has never been walked.
    const complete = await syncAccountQueue(
      admin,
      { ...account, synced_through_solo: null, synced_through_flex: null },
      queue,
      apiKey,
      playersByPuuid,
      teamPlayerIds,
      summary,
      playersWithNewMatches,
      deadline,
    );
    if (!complete) summary.partial = true;
  }

  await touchAccount(admin, account.puuid);
  await refreshAccountRank(admin, account, apiKey);
  await rollUpPlayerRanks(admin, accounts);

  for (const playerId of playersWithNewMatches) {
    const { wins, losses } = await countWinLoss(admin, playerId);
    const { error } = await admin.from("players").update({ wins, losses }).eq("id", playerId);
    if (error) throw new Error(error.message);
  }


  return summary;
}

async function touchAccount(admin: SupabaseClient, puuid: string) {
  const { error } = await admin
    .from("player_accounts")
    .update({ last_walked_at: new Date().toISOString() })
    .eq("puuid", puuid);
  if (error) throw new Error(error.message);
}

export type RefetchSummary = {
  matchesUpdated: number;
  remaining: number;
  partial: boolean;
};

// Re-fetches match detail for matches already in the database and rewrites
// their participant rows. Only needed after a migration widens what's captured
// (005's detail columns, 024's bans) — the normal sync never re-reads a match it
// already has.
//
// Resumable by design: matches are processed oldest-fetch-first and their
// fetched_at is bumped as they go, so an interrupted run leaves the unprocessed
// ones at the front of the queue and the next run continues rather than
// restarting.
export async function refetchMatchDetails(admin: SupabaseClient): Promise<RefetchSummary> {
  const apiKey = await loadApiKey(admin);
  const deadline = new Deadline(SYNC_BUDGET_MS);
  const startedAt = new Date().toISOString();

  const { data: accountRows, error: accountsError } = await admin
    .from("player_accounts")
    .select("puuid, player_id");
  if (accountsError) throw new Error(accountsError.message);
  const playerIdByPuuid = new Map(
    (accountRows ?? []).map((a) => [a.puuid as string, a.player_id as string]),
  );

  const summary: RefetchSummary = { matchesUpdated: 0, remaining: 0, partial: false };

  for (;;) {
    // Excluded matches (remakes, early surrenders) have no participant rows to
    // update — upserting would materialise the very rows the exclusion exists
    // to avoid.
    const { data: pending, error: pendingError } = await admin
      .from("matches")
      .select("id, riot_match_id, queue_id")
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
          playerId: playerIdByPuuid.get(p.puuid) ?? null,
          queueId: match.info.queueId,
        }),
      );

      // (match_id, puuid) is unique, so this updates in place and preserves each
      // row's id — which match_notes references.
      const { error: upsertError } = await admin
        .from("match_participants")
        .upsert(participantRows, { onConflict: "match_id,puuid" });
      if (upsertError) throw new Error(upsertError.message);

      // Bans come from the same response, so a refetch is also the backfill for
      // matches stored before migration 024 added the columns.
      const { error: touchError } = await admin
        .from("matches")
        .update({
          fetched_at: new Date().toISOString(),
          blue_bans: bansForTeam(match, 100),
          red_bans: bansForTeam(match, 200),
        })
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

type TrackedPlayer = { playerId: string; displayName: string };

// Walks one account's history for one queue, backwards from newest. Returns
// true if it reached a confirmed-covered point (so the cursor can be advanced),
// false if it stopped early on the time budget or the pagination cap.
async function syncAccountQueue(
  admin: SupabaseClient,
  account: Account,
  queue: TrackedQueue,
  apiKey: string,
  playersByPuuid: Map<string, TrackedPlayer>,
  /** The main team, by player id — the flex gate below tests against it. */
  teamPlayerIds: Set<string>,
  summary: SyncSummary,
  playersWithNewMatches: Set<string>,
  deadline: Deadline,
): Promise<boolean> {
  const cursorValue = account[CURSOR_COLUMN[queue]];
  const syncedThrough = cursorValue ? new Date(cursorValue) : null;
  const trackingStart = TRACKING_START[queue];
  // Riot filters by start time server-side. Without it a flex walk would page
  // back through every game the account has ever played to discover that the
  // ones before June aren't wanted — and flex history is years deep.
  const startTimeSeconds = Math.floor(trackingStart.getTime() / 1000);
  let start = 0;

  while (start < MAX_MATCH_IDS_PER_WALK) {
    if (!deadline.hasRoomForCall()) return false;

    let matchIds: string[];
    try {
      matchIds = await getMatchIds(account.puuid, apiKey, {
        queue: QUEUE_ID[queue],
        startTime: startTimeSeconds,
        start,
        count: MATCH_ID_PAGE_SIZE,
        platform: account.platform,
      });
    } catch (e) {
      throw toSyncError(e);
    }

    // Ran out of history entirely — coverage now extends to the tracking start.
    if (matchIds.length === 0) return await completeSync(admin, account, queue);

    // One lookup per page instead of per match: the walk deliberately passes
    // *through* already-known matches (rather than stopping at the first one),
    // so this runs on every id in the page, every run.
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
          return await completeSync(admin, account, queue, syncedThrough);
        }
        // Known, but above the cursor — e.g. discovered through a teammate's
        // sync, or inserted by a run that was cut short before it could confirm
        // contiguity. Keep walking backwards to fill in whatever sits under it.
        continue;
      }

      if (!deadline.hasRoomForCall()) return false;

      let match;
      try {
        match = await getMatchById(matchId, apiKey, account.platform);
      } catch (e) {
        throw toSyncError(e);
      }

      const gameCreation = new Date(match.info.gameCreation);
      if (gameCreation < trackingStart) return await completeSync(admin, account, queue);

      // Excluded games still get a `matches` row and simply no participant
      // rows: an unrecorded match id is one the walk would re-fetch on every
      // future sync forever, and every read path joins through the participant
      // views, so a match with none is invisible to stats.
      //
      // The queue test is membership of every tracked queue, not equality with
      // the one being walked — so a game the *other* queue's walk turns up is
      // kept and counted rather than written off as off-queue. That is what
      // makes "we came across a flex game while looking for soloQ" store the
      // game instead of burning a detail call on it. The other queue's cursor
      // is untouched, which stays correct: finding one of its games says
      // nothing about its contiguity.
      const excluded =
        !TRACKED_QUEUE_IDS.includes(match.info.queueId) ||
        match.info.gameDuration < MIN_COUNTED_DURATION_SECONDS ||
        match.info.participants.some((p) => p.gameEndedInEarlySurrender) ||
        // Flex is a queue the main team plays *as* the team, and this app has
        // no use for any other kind: three of the roster plus two friends is a
        // real game for those three and says nothing about the team, which is
        // the only subject the flex rows have. So a flex game is stored when
        // five of the team were on one side, and otherwise gets the same
        // treatment as a remake — a marker row, no participants, invisible
        // everywhere.
        //
        // Resolved through player_id, not puuid: it is the same person in the
        // same seat whichever of their accounts they queued on.
        //
        // Two things this costs, both worth knowing. The detail call is spent
        // either way — an id page returns ids, so the lineup is only knowable
        // from the response. And the judgement is made against the roster as it
        // stands *now*: a game skipped before a sixth member was added stays
        // skipped, and getting it back means deleting its marker row and
        // nulling the flex cursor.
        (match.info.queueId === QUEUE_FLEX &&
          !isFullStack(
            match.info.participants.map((p) => ({
              teamId: p.teamId,
              playerId: playersByPuuid.get(p.puuid)?.playerId ?? null,
            })),
            teamPlayerIds,
          ));

      const { data: insertedMatch, error: insertMatchError } = await admin
        .from("matches")
        .insert({
          riot_match_id: matchId,
          queue_id: match.info.queueId,
          game_creation: gameCreation.toISOString(),
          game_duration_seconds: match.info.gameDuration,
          game_version: match.info.gameVersion,
          blue_bans: bansForTeam(match, 100),
          red_bans: bansForTeam(match, 200),
          excluded,
        })
        .select("id")
        .single();

      if (insertMatchError) {
        // Another account's loop in this same run just inserted the same shared
        // match — the common case for a five-man flex game.
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
          playerId: playersByPuuid.get(p.puuid)?.playerId ?? null,
          queueId: match.info.queueId,
        }),
      );

      const { error: insertParticipantsError } = await admin
        .from("match_participants")
        .insert(participantRows);
      if (insertParticipantsError) throw new Error(insertParticipantsError.message);

      for (const row of participantRows) {
        if (row.player_id) playersWithNewMatches.add(row.player_id);
      }

      // Multikills, collected for the Discord alert.
      //
      // Safe against duplicates by construction: riot_match_id is unique, and
      // this block only runs on a match this call just inserted. A shared game
      // is inserted once no matter how many tracked accounts were in it, and a
      // re-run of the sync takes the 23505 branch above instead of reaching
      // here — so a multikill can be announced at most once.
      //
      // The age guard is the real safeguard, and it's guarding a different
      // thing: attaching an account backfills its entire history, which without
      // this would replay every penta in it into the channel as if it had just
      // happened.
      if (Date.now() - gameCreation.getTime() <= MULTIKILL_MAX_AGE_MS) {
        for (const row of participantRows) {
          const displayName = playersByPuuid.get(row.puuid)?.displayName;
          if (!displayName) continue;

          // Penta wins over quadra rather than both firing. Riot's counters are
          // independent fields, but a pentakill is reached *through* a quadra,
          // so a game with a penta can carry both — and announcing the same
          // moment twice, the second time as the lesser achievement, reads as a
          // bug. Only the best one in the game is reported.
          const kind = row.penta_kills ? "penta" : row.quadra_kills ? "quadra" : null;
          if (!kind) continue;

          summary.multikills.push({
            kind,
            displayName,
            championName: row.champion_name,
            championId: row.champion_id,
            count: kind === "penta" ? row.penta_kills! : row.quadra_kills!,
            gameCreation: gameCreation.toISOString(),
          });
        }
      }

      summary.newMatches += 1;
      const foundQueue = match.info.queueId === QUEUE_ID.flex ? "flex" : "solo";
      summary.newMatchesByQueue[foundQueue] += 1;
    }

    // A short page is the end of this account's history in this queue.
    if (matchIds.length < MATCH_ID_PAGE_SIZE) return await completeSync(admin, account, queue);
    start += MATCH_ID_PAGE_SIZE;
  }

  // Hit the pagination cap with history still left — not contiguous yet.
  return false;
}

// Records that this account's history in this queue is now covered contiguously
// from now back to `through` (the queue's tracking start, unless an existing
// cursor was reached).
async function completeSync(
  admin: SupabaseClient,
  account: Account,
  queue: TrackedQueue,
  through?: Date,
) {
  const cursor = through ?? TRACKING_START[queue];
  const { error } = await admin
    .from("player_accounts")
    .update({ [CURSOR_COLUMN[queue]]: cursor.toISOString() })
    .eq("puuid", account.puuid);
  if (error) throw new Error(error.message);
  return true;
}

/**
 * This app's own tracked soloQ record — not Riot's live ranked-season totals,
 * and not every game it stores.
 *
 * Counted through soloq_participants rather than the base table. That is the
 * whole of what keeps flex out of the rank surfaces: players.wins/losses feeds
 * the rank badge, the roster grid and the team winrate, and all three mean
 * "solo queue" wherever they appear.
 *
 * Counted in Postgres rather than by selecting the rows and folding them in JS.
 * The old version did the latter, and PostgREST silently truncates a select at
 * the project's "Max rows" setting (1000 by default) instead of erroring — so
 * past that many games it would have written *wrong* totals to players, and
 * written them persistently, where every page reads them back as fact. A
 * head+count query has no row limit to hit and moves no data.
 */
async function countWinLoss(
  admin: SupabaseClient,
  playerId: string,
): Promise<{ wins: number; losses: number }> {
  const [winsResult, totalResult] = await Promise.all([
    admin
      .from("soloq_participants")
      .select("*", { count: "exact", head: true })
      .eq("player_id", playerId)
      .eq("win", true),
    admin
      .from("soloq_participants")
      .select("*", { count: "exact", head: true })
      .eq("player_id", playerId),
  ]);
  if (winsResult.error) throw new Error(winsResult.error.message);
  if (totalResult.error) throw new Error(totalResult.error.message);

  const wins = winsResult.count ?? 0;
  return { wins, losses: (totalResult.count ?? 0) - wins };
}

/**
 * Both ranked queues for one account, in one Riot call.
 *
 * Writes the account's own snapshot and appends to its LP series. It does NOT
 * write anything on players — that is rollUpPlayerRanks' job, because the
 * displayed rank depends on every account the person owns.
 */
async function refreshAccountRank(admin: SupabaseClient, account: Account, apiKey: string) {
  let entries;
  try {
    entries = await getLeagueEntries(account.puuid, account.platform, apiKey);
  } catch (e) {
    throw toSyncError(e);
  }

  const { error } = await admin
    .from("player_accounts")
    .update({
      tier: entries.solo?.tier ?? null,
      division: entries.solo?.rank ?? null,
      league_points: entries.solo?.leaguePoints ?? null,
      flex_tier: entries.flex?.tier ?? null,
      flex_division: entries.flex?.rank ?? null,
      flex_league_points: entries.flex?.leaguePoints ?? null,
      rank_updated_at: new Date().toISOString(),
    })
    .eq("puuid", account.puuid);
  if (error) throw new Error(error.message);

  await recordRankHistory(admin, account, "solo", entries.solo);
  await recordRankHistory(admin, account, "flex", entries.flex);
}

type AccountRankRow = {
  puuid: string;
  player_id: string;
  tier: string | null;
  division: string | null;
  league_points: number | null;
};

/**
 * Writes each player's displayed rank: the best soloQ rank among their accounts.
 *
 * "Best" is by ladderPoints (lib/rank.ts), which is tier/division/LP projected
 * onto one continuous scale — so it compares across servers without caring that
 * one account is on LAS and another on BR. Comparing tiers as strings, or LP
 * alone, would both get a Gold I / Silver II pair backwards.
 *
 * Denormalising this onto players rather than joining for it at read time is
 * what keeps RankBadge, the roster grid's sort, buildStandings and the Squad
 * list untouched by any of this.
 */
async function rollUpPlayerRanks(
  admin: SupabaseClient,
  accounts: Account[],
): Promise<RankChange[]> {
  if (accounts.length === 0) return [];

  const { data: freshRows, error: freshError } = await admin
    .from("player_accounts")
    .select("puuid, player_id, tier, division, league_points");
  if (freshError) throw new Error(freshError.message);

  const { data: playerRows, error: playerError } = await admin
    .from("players")
    .select("id, display_name, tier, division");
  if (playerError) throw new Error(playerError.message);

  const best = new Map<string, AccountRankRow>();
  for (const row of (freshRows ?? []) as AccountRankRow[]) {
    if (!row.tier) continue;
    const points = ladderPoints({
      tier: row.tier,
      division: row.division,
      league_points: row.league_points ?? 0,
    });
    if (points === null) continue;

    const incumbent = best.get(row.player_id);
    const incumbentPoints = incumbent
      ? ladderPoints({
          tier: incumbent.tier,
          division: incumbent.division,
          league_points: incumbent.league_points ?? 0,
        })
      : null;
    if (incumbentPoints === null || points > incumbentPoints) best.set(row.player_id, row);
  }

  // The primary account is what the header's Riot ID means, and it can drift
  // when somebody renames — so it's mirrored here alongside the rank rather
  // than being a second thing somebody has to remember to update.
  const primary = new Map(accounts.filter((a) => a.is_primary).map((a) => [a.player_id, a]));

  const changes: RankChange[] = [];

  for (const player of playerRows ?? []) {
    const playerId = player.id as string;
    const winner = best.get(playerId) ?? null;
    const primaryAccount = primary.get(playerId);

    const snapshot: Record<string, unknown> = {
      tier: winner?.tier ?? null,
      division: winner?.division ?? null,
      league_points: winner?.league_points ?? null,
      rank_updated_at: new Date().toISOString(),
    };
    if (primaryAccount) {
      snapshot.platform = primaryAccount.platform;
    }

    // Compared before the update below overwrites the old values.
    //
    // Tier/division only, not LP: a promotion is news, and "gained 14 LP" three
    // times a day is the kind of notification that gets a webhook muted. Both
    // sides must be ranked for this to mean anything — placements finishing
    // (null -> Silver IV) isn't a promotion, and a season reset isn't a
    // demotion.
    const beforeTier = player.tier as string | null;
    const beforeDivision = player.division as string | null;
    const afterTier = winner?.tier ?? null;
    const afterDivision = winner?.division ?? null;

    if ((beforeTier !== afterTier || beforeDivision !== afterDivision) && beforeTier && afterTier) {
      const before = ladderPoints({ tier: beforeTier, division: beforeDivision, league_points: 0 });
      const after = ladderPoints({ tier: afterTier, division: afterDivision, league_points: 0 });
      if (before !== null && after !== null && before !== after) {
        changes.push({
          displayName: player.display_name as string,
          from: formatRank(beforeTier, beforeDivision),
          to: formatRank(afterTier, afterDivision),
          promoted: after > before,
        });
      }
    }

    const { error } = await admin.from("players").update(snapshot).eq("id", playerId);
    if (error) throw new Error(error.message);
  }

  return changes;
}

// Appends to an account's LP time series, but only when there's something new
// to say. The navbar's manual sync button can be pressed any number of times a
// day, and a graph made of identical points is just noise.
//
// One series per (account, queue). An unranked queue writes nothing at all
// rather than a null point — a gap in the series renders as a gap, where a null
// row would have to be filtered out by every reader.
async function recordRankHistory(
  admin: SupabaseClient,
  account: Account,
  queue: TrackedQueue,
  entry: LeagueEntryDto | null,
) {
  if (!entry) return;

  const { data: latest, error } = await admin
    .from("player_rank_history")
    .select("tier, division, league_points, recorded_at")
    .eq("account_id", account.puuid)
    .eq("queue", queue)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (latest) {
    const unchanged =
      latest.tier === entry.tier &&
      latest.division === entry.rank &&
      latest.league_points === entry.leaguePoints;
    const recent =
      Date.now() - new Date(latest.recorded_at as string).getTime() < RANK_HISTORY_MAX_GAP_MS;

    if (unchanged && recent) return;
  }

  const { error: insertError } = await admin.from("player_rank_history").insert({
    player_id: account.player_id,
    account_id: account.puuid,
    queue,
    tier: entry.tier,
    division: entry.rank,
    league_points: entry.leaguePoints,
    // Riot's own totals for this queue, which is what a point on the graph
    // should be labelled with — unlike players.wins/losses, which is the app's
    // tracked record since its own start date.
    wins: entry.wins,
    losses: entry.losses,
  });
  if (insertError) throw new Error(insertError.message);
}

function toSyncError(e: unknown) {
  // Delegates to isRiotKeyRejection rather than testing statuses here, because
  // the 400 case needs Riot's response body to decide and this is not the only
  // caller that has to get that judgement right — /settings uses the same rule
  // via describeRiotError.
  if (isRiotKeyRejection(e)) {
    return new RiotKeyInvalidError(e instanceof Error ? e.message : "Riot rejected the API key");
  }
  return e instanceof Error ? e : new Error("Unknown Riot API error");
}
