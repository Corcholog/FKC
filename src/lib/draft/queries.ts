// Read paths for the draft strategy tables.
//
// draft_tags and champion_profiles do NOT page through fetchAllRows: both are
// small by construction (~170 champions at absolute most, a few dozen tags)
// and will stay that way — there's no history that accumulates here the way
// match rows or scrim games do. Plain selects are the honest choice; paging
// would be ceremony that implies a growth pattern this data doesn't have.
//
// champion_counters is different — see loadChampionCounters below.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type {
  ChampionCounterRow,
  ChampionProfileRow,
  CounterIndex,
  DraftTagKind,
  DraftTagRow,
} from "@/lib/draft/types";

const TAG_COLUMNS = "id, slug, label, kind, created_at";
const PROFILE_COLUMNS = "champion_id, roles, tags, notes, updated_at, updated_by";
const COUNTER_COLUMNS =
  "id, counter_champion_id, target_champion_id, note, created_by, created_at, updated_at";

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

/**
 * Every noted matchup. Unlike the two loaders above, this one pages: at ten
 * picks a champion it's still small today, but it's the one table in the
 * draft-strategy feature that accumulates the way scrim picks do — a season
 * of noted matchups is exactly the shape that reaches PostgREST's silent
 * 1000-row truncation. Ordered on the unique pair, which is a total order, so
 * `.range()` paging can't overlap or skip — see lib/scrims/queries.ts:74-84
 * for the same trap in the table this pattern is copied from.
 */
export async function loadChampionCounters(supabase: SupabaseClient): Promise<ChampionCounterRow[]> {
  return fetchAllRows<ChampionCounterRow>((from, to) =>
    supabase
      .from("champion_counters")
      .select(COUNTER_COLUMNS)
      .order("counter_champion_id")
      .order("target_champion_id")
      .range(from, to)
      .returns<ChampionCounterRow[]>(),
  );
}

/** Both readings of the counters table, built in one pass over the raw rows. */
export function indexCounters(rows: ChampionCounterRow[]): CounterIndex {
  const counters = new Map<number, ChampionCounterRow[]>();
  const counteredBy = new Map<number, ChampionCounterRow[]>();
  for (const row of rows) {
    const forward = counters.get(row.counter_champion_id) ?? [];
    forward.push(row);
    counters.set(row.counter_champion_id, forward);

    const backward = counteredBy.get(row.target_champion_id) ?? [];
    backward.push(row);
    counteredBy.set(row.target_champion_id, backward);
  }
  return { counters, counteredBy };
}
