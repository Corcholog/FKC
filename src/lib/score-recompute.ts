// Filling in match_participants.performance_score for matches already stored.
//
// Separate from sync.ts on purpose: that module is the Riot walk, and every
// budget and rate limit in it exists because of Riot. This makes no API calls at
// all. It reads rows the database already has, runs the pure function in
// score.ts over them, and writes the result back — so its only real constraint
// is how long a server action may run.
//
// Needed twice in the life of the app:
//   1. Right after migration 030, when the column exists and is null everywhere.
//   2. After a change to the formula in score.ts, which this column caches.
//
// Case 2 needs one line in the SQL editor first, because a row that already has
// a score is not a candidate here:
//   update match_participants set performance_score = null;
// then press the button. That is deliberate — the alternative is a recompute
// that cannot tell "already correct" from "computed by an older formula" and so
// has to rewrite every row in the table on every run, losing the resumability
// that makes the button safe to press on a free-tier database.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllByIds } from "@/lib/supabase/fetch-all";
import { DETAIL_COLUMNS, withPerformanceScores, type ScoreInput } from "@/lib/score";

/**
 * Wall-clock budget for one run.
 *
 * Much smaller than sync.ts's 50s: there are no Riot calls to wait on, so the
 * work is bounded by Postgres round trips and this is only here to guarantee
 * the action returns rather than to ration a rate limit.
 */
const RECOMPUTE_BUDGET_MS = 20_000;

/**
 * Matches per round trip — 2000 participant rows.
 *
 * Larger than it looks like it needs to be, because of how the write below
 * works: the number of update calls per batch is bounded by the number of
 * *distinct scores* in it (at most 101), not by the number of rows. A big batch
 * amortises that fixed cost over more rows; a batch of 50 would pay nearly the
 * same 101 round trips for a tenth of the work.
 */
const MATCH_BATCH = 200;

export type RecomputeSummary = {
  matchesScored: number;
  /** Participant rows still awaiting a score when the run stopped. */
  remaining: number;
  partial: boolean;
};

// The columns score.ts reads, plus what's needed to write the result back and
// to group rows by match.
const SCORE_COLUMNS =
  "id, match_id, team_id, team_position, kills, deaths, assists, " +
  "damage_dealt_to_champions, gold_earned, total_minions_killed, neutral_minions_killed, " +
  "vision_score, total_damage_taken, detector_wards_placed, " +
  "turret_takedowns, dragon_takedowns, baron_takedowns, inhibitor_takedowns, objectives_stolen";

type ScoreRow = ScoreInput & { id: string; match_id: string };

/**
 * Narrows a query to rows that still need a score *and* could actually receive
 * one.
 *
 * The DETAIL_COLUMNS half is what makes this queue drain, and it is that exact
 * list rather than a convenient subset of it because it has to agree with
 * score.ts's own `hasDetail` predicate. A row this filter admits but that
 * predicate rejects would be selected, scored as null, written back as nothing,
 * and selected again next run — a "remaining" count that never reaches zero.
 *
 * Excluding a detail-less row is not giving up on it either: "Re-fetch match
 * details" fills those columns, at which point the row enters this set on its
 * own. The two backfills compose, and the order they are pressed in does not
 * matter.
 *
 * Takes the already-selected builder rather than building one, because
 * supabase-js only exposes filters after `.select()` — and the two callers
 * below need different projections off the same filter.
 */
function onlyPending<
  T extends {
    is: (c: string, v: null) => T;
    not: (c: string, o: string, v: null) => T;
  },
>(query: T): T {
  let q = query.is("performance_score", null);
  for (const column of DETAIL_COLUMNS) q = q.not(column, "is", null);
  return q;
}

async function countPending(admin: SupabaseClient): Promise<number> {
  const { count, error } = await onlyPending(
    admin.from("match_participants").select("id", { count: "exact", head: true }),
  );
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function recomputeScores(admin: SupabaseClient): Promise<RecomputeSummary> {
  const endsAt = Date.now() + RECOMPUTE_BUDGET_MS;
  const summary: RecomputeSummary = {
    matchesScored: 0,
    remaining: 0,
    partial: false,
  };

  for (;;) {
    if (Date.now() >= endsAt) {
      summary.partial = true;
      break;
    }

    // Which matches to do next. Asking for match_id on the pending rows and
    // de-duplicating here rather than in SQL: PostgREST has no DISTINCT, and a
    // view or RPC for it would be a schema object to maintain for one button.
    const { data: pending, error: pendingError } = await onlyPending(
      admin.from("match_participants").select("match_id"),
    ).limit(MATCH_BATCH * 10);
    if (pendingError) throw new Error(pendingError.message);

    const matchIds = [...new Set((pending ?? []).map((r) => r.match_id as string))].slice(
      0,
      MATCH_BATCH,
    );
    if (matchIds.length === 0) break;

    // Durations, for the per-minute rates. Excluded matches have their
    // participant rows deleted, so anything reaching here has a real duration.
    const { data: matches, error: matchesError } = await admin
      .from("matches")
      .select("id, game_duration_seconds")
      .in("id", matchIds);
    if (matchesError) throw new Error(matchesError.message);
    const durationById = new Map(
      (matches ?? []).map((m) => [m.id as string, m.game_duration_seconds as number]),
    );

    // Every participant of those matches, not only the pending ones: the score
    // is relative to the lobby, so scoring one row needs the other nine even
    // when those nine already have a score.
    //
    // Paged, via fetchAllByIds. A plain `.in()` here is the exact trap
    // lib/match-rows.ts documents: 200 matches is 2000 rows, PostgREST truncates
    // at the project's Max rows without erroring, and the matches past the cut
    // come back with no participants at all. They are then never scored, stay
    // pending, and are selected again on the next batch — a loop that burns its
    // whole budget re-reading the same rows and never drains. A total order is
    // what makes `.range()` paging safe.
    const rows = await fetchAllByIds<ScoreRow>(matchIds, (chunk, from, to) =>
      admin
        .from("match_participants")
        .select(SCORE_COLUMNS)
        .in("match_id", chunk)
        .order("match_id")
        .order("id")
        .range(from, to)
        .returns<ScoreRow[]>(),
    );

    const byMatch = new Map<string, ScoreRow[]>();
    for (const row of rows) {
      const list = byMatch.get(row.match_id);
      if (list) list.push(row);
      else byMatch.set(row.match_id, [row]);
    }

    // Grouped by score, because the write is an UPDATE and not an upsert.
    // An upsert of {id, performance_score} would be an INSERT ... ON CONFLICT,
    // and Postgres builds the proposed row before resolving the conflict — so a
    // partial row fails the NOT NULL constraints on match_id, puuid, champion_id
    // and the rest. Writing whole rows back instead would hit total_cs, which is
    // GENERATED ALWAYS and rejects any value at all.
    //
    // So: one UPDATE per distinct score, each covering every row that earned it.
    // At most 101 of them for a batch of any size, which is what MATCH_BATCH is
    // sized against.
    const idsByScore = new Map<number | null, string[]>();
    for (const [matchId, participants] of byMatch) {
      const duration = durationById.get(matchId);
      if (duration === undefined) continue;

      for (const scored of withPerformanceScores(participants, duration)) {
        // Null means the row cannot be scored. It is already null in the
        // database — that is how it got selected — so writing it back would be
        // a no-op round trip.
        if (scored.performance_score === null) continue;
        const ids = idsByScore.get(scored.performance_score);
        if (ids) ids.push(scored.id);
        else idsByScore.set(scored.performance_score, [scored.id]);
      }
      summary.matchesScored += 1;
    }

    if (idsByScore.size === 0) break;

    for (const [score, ids] of idsByScore) {
      const { error: updateError } = await admin
        .from("match_participants")
        .update({ performance_score: score })
        .in("id", ids);
      if (updateError) throw new Error(updateError.message);
    }
  }

  summary.remaining = await countPending(admin);
  return summary;
}
