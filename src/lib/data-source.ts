// Which set of tables a read goes to.
//
// Every page in the app reads its data twice over: once for the private app,
// where the rows carry real Riot IDs and real names, and once for the public
// demo at /demo, where they must not. The demo reads Postgres views named
// `demo_<table>` that project the same column names with identity replaced by
// aliases and free text dropped — so the *only* thing that differs between the
// two reads is the table name.
//
// That's what this type is for. A loader takes a DataSource instead of a
// SupabaseClient, calls `source.table("match_participants")`, and serves both
// versions with no `if (demo)` branch in the query. The alternative is a second
// copy of every loader, which is a second copy of every future bug.
//
// The safety property does not live here. It lives in the views (the sensitive
// columns don't exist in them) and in `createPublicClient()` (whose JWT is
// `anon`, which RLS denies on every real table). `demoSource` pointing at the
// wrong client would fail closed, not leak.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Tables that have a `demo_` counterpart. Notes and AI tables deliberately don't. */
export type TableName =
  | "players"
  | "matches"
  | "match_participants"
  | "player_rank_history"
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

/**
 * Which queue a read is about.
 *
 * The second axis, and it works the same way as the demo one: instead of every
 * page remembering `.eq("queue_id", 420)`, `table("match_participants")`
 * resolves to a view that already only contains that queue. A page reads soloQ
 * because of which source it was handed, not because a filter was written in
 * the right dozen places.
 *
 * That matters more than it sounds. Migration 012 gave scrims their own tables
 * rather than sharing these, precisely because a forgotten queue filter
 * produces a plausible wrong number instead of an error — around twelve
 * modules, each of which would have needed one. This is the same protection
 * with none of the duplication.
 */
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
   * True when reading the anonymized views. Loaders use it to skip the things
   * the demo has no counterpart for — match notes, AI summaries, "edited by"
   * attribution — rather than to choose a table name.
   */
  demo: boolean;
  /**
   * Which queue `table("match_participants")` resolves to. Exposed so a loader
   * can say which games it is describing ("42 flex games") without inferring it
   * from a table name.
   */
  queue: QueueScope;
};

function resolve(name: TableName, queue: QueueScope, demo: boolean): string {
  const base = name === "match_participants" ? PARTICIPANT_VIEW[queue] : name;
  return demo ? `demo_${base}` : base;
}

/**
 * Defaults to solo, and that default is load-bearing: every page that existed
 * before flex did keeps reading exactly the rows it read before, without being
 * touched.
 */
export function privateSource(supabase: SupabaseClient, queue: QueueScope = "solo"): DataSource {
  return { supabase, table: (name) => resolve(name, queue, false), demo: false, queue };
}

export function demoSource(supabase: SupabaseClient, queue: QueueScope = "solo"): DataSource {
  return { supabase, table: (name) => resolve(name, queue, true), demo: true, queue };
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
 * Same discipline as parseScope and parsePage: an unrecognised value becomes
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
