// Read paths for the draft strategy tables.
//
// Unlike lib/scrims/queries.ts, these do NOT page through fetchAllRows: both
// tables are small by construction (~170 champions at absolute most, a few
// dozen tags) and will stay that way — there's no history that accumulates
// here the way match rows or scrim games do. Plain selects are the honest
// choice; paging would be ceremony that implies a growth pattern this data
// doesn't have.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChampionProfileRow, DraftTagKind, DraftTagRow } from "@/lib/draft/types";

const TAG_COLUMNS = "id, slug, label, kind, created_at";
const PROFILE_COLUMNS = "champion_id, roles, tags, notes, updated_at, updated_by";

export async function loadDraftTags(
  supabase: SupabaseClient,
  kind?: DraftTagKind,
): Promise<DraftTagRow[]> {
  let query = supabase.from("draft_tags").select(TAG_COLUMNS);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.order("label").returns<DraftTagRow[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Every annotated champion, keyed by id — most reads want a lookup, not a list. */
export async function loadChampionProfiles(
  supabase: SupabaseClient,
): Promise<Map<number, ChampionProfileRow>> {
  const { data, error } = await supabase
    .from("champion_profiles")
    .select(PROFILE_COLUMNS)
    .returns<ChampionProfileRow[]>();
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.champion_id, row]));
}
