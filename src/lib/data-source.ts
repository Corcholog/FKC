// Which set of tables a read goes to.
//
// One axis now, and it is the queue. Instead of every page remembering
// `.eq("queue_id", 420)`, `table("match_participants")` resolves to a view that
// already only contains that queue. A page reads soloQ because of which source
// it was handed, not because a filter was written in the right dozen places.
//
// That matters more than it sounds. Migration 012 gave scrims their own tables
// rather than sharing these, precisely because a forgotten queue filter
// produces a plausible wrong number instead of an error — around twelve
// modules, each of which would have needed one. This is the same protection
// with none of the duplication.
//
// There used to be a second axis here: the public demo at /demo read `demo_*`
// views that projected the same column names with identity replaced by aliases,
// so one loader served both. The demo is gone (ADR-050), and with it the rule
// that every page needed an anonymized twin.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Tables a loader can name. */
export type TableName =
  | "players"
  | "matches"
  | "match_participants"
  | "champion_tier_lists"
  | "champion_profiles"
  | "champion_counters"
  | "draft_comps"
  | "draft_tags"
  | "team_opponents"
  | "team_series"
  | "team_games"
  | "team_picks"
  | "competitions";

/** Which queue a read is about. */
export type QueueScope = "solo" | "flex" | "ranked";

const PARTICIPANT_VIEW: Record<QueueScope, string> = {
  solo: "soloq_participants",
  flex: "flex_participants",
  ranked: "ranked_participants",
};

export type DataSource = {
  supabase: SupabaseClient;
  table: (name: TableName) => string;
  /**
   * Which queue `table("match_participants")` resolves to. Exposed so a loader
   * can say which games it is describing ("42 flex games") without inferring it
   * from a table name.
   */
  queue: QueueScope;
};

function resolve(name: TableName, queue: QueueScope): string {
  return name === "match_participants" ? PARTICIPANT_VIEW[queue] : name;
}

/**
 * Defaults to solo, and that default is load-bearing: every page that existed
 * before flex did keeps reading exactly the rows it read before, without being
 * touched.
 */
export function privateSource(supabase: SupabaseClient, queue: QueueScope = "solo"): DataSource {
  return { supabase, table: (name) => resolve(name, queue), queue };
}

/**
 * The soloQ-only participant view, named for the reads that don't go through a
 * DataSource.
 *
 * A handful of paths — the navbar's lane sample, the AI prompts, the weekly
 * Discord recap, the tier-list editor's champion pool — query Supabase directly
 * rather than through a loader, so nothing hands them a scoped source. They all
 * mean solo queue, and naming the view here rather than spelling the string out
 * eight times is what makes them findable when a third queue arrives.
 */
export const SOLOQ_PARTICIPANTS = "soloq_participants";

/**
 * The flex-only participant view, for the same kind of direct read.
 *
 * Worth its own constant for a reason soloQ's comment does not cover: only
 * full-stack games are ever stored in queue 440, so selecting from this view is
 * already "games the five played together" — no caller has to re-establish that,
 * and none should try, because the roster check happens at write time against
 * the accounts linked then. See lib/flex-recheck.ts.
 */
export const FLEX_PARTICIPANTS = "flex_participants";

/**
 * The same view as a PostgREST embed, aliased back to the base table's name.
 *
 * `match_participants:soloq_participants!inner(...)` filters through the view
 * but returns the rows under the key callers already destructure, so scoping an
 * existing embedded query is a one-line change rather than a rename that
 * ripples into its row types.
 */
export const SOLOQ_PARTICIPANTS_EMBED = `match_participants:${SOLOQ_PARTICIPANTS}!inner`;

const QUEUE_SCOPES: QueueScope[] = ["solo", "flex", "ranked"];

/**
 * `?queue=flex`, falling back to solo.
 *
 * Same discipline as parseSource and parsePage: an unrecognised value becomes
 * the reading that changes nothing, rather than an error page or an empty one.
 */
export function parseQueueScope(value: string | string[] | undefined): QueueScope {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (QUEUE_SCOPES as string[]).includes(raw) ? (raw as QueueScope) : "solo";
}

export const QUEUE_SCOPE_LABELS: Record<QueueScope, string> = {
  solo: "SoloQ",
  flex: "FlexQ",
  ranked: "Both",
};
