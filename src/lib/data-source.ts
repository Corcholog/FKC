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
  | "scrim_opponents"
  | "scrim_series"
  | "scrim_games"
  | "scrim_picks";

export type DataSource = {
  supabase: SupabaseClient;
  table: (name: TableName) => string;
  /**
   * True when reading the anonymized views. Loaders use it to skip the things
   * the demo has no counterpart for — match notes, AI summaries, "edited by"
   * attribution — rather than to choose a table name.
   */
  demo: boolean;
};

export function privateSource(supabase: SupabaseClient): DataSource {
  return { supabase, table: (name) => name, demo: false };
}

export function demoSource(supabase: SupabaseClient): DataSource {
  return { supabase, table: (name) => `demo_${name}`, demo: true };
}
