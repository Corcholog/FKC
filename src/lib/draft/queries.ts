// Read paths for the draft strategy tables.
//
// draft_tags and champion_profiles do NOT page through fetchAllRows: both are
// small by construction (~170 champions at absolute most, a few dozen tags)
// and will stay that way — there's no history that accumulates here the way
// match rows or scrim games do. Plain selects are the honest choice; paging
// would be ceremony that implies a growth pattern this data doesn't have.
//
// champion_counters is different — see loadChampionCounters below.

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { DataSource } from "@/lib/data-source";
import type {
  ChampionCounterRow,
  ChampionProfileRow,
  CounterIndex,
  DraftCompKind,
  DraftCompRow,
  DraftTagKind,
  DraftTagRow,
} from "@/lib/draft/types";

// Three tables carry an author column. Nothing renders it; the write path is
// its only reader.
const TAG_COLUMNS = "id, slug, label, kind, created_at";
const PROFILE_BASE = "champion_id, roles, tags, notes, updated_at";
const COUNTER_BASE = "id, counter_champion_id, target_champion_id, note, created_at, updated_at";
const COMP_BASE = "id, kind, label, champion_ids, win_conditions, notes, created_at, updated_at";

const withAuthor = (base: string, column: string) => `${base}, ${column}`;

export async function loadDraftTags(
  source: DataSource,
  kind?: DraftTagKind,
): Promise<DraftTagRow[]> {
  let query = source.supabase.from(source.table("draft_tags")).select(TAG_COLUMNS);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.order("label").returns<DraftTagRow[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Every annotated champion, keyed by id — most reads want a lookup, not a list. */
export async function loadChampionProfiles(
  source: DataSource,
): Promise<Map<number, ChampionProfileRow>> {
  const { data, error } = await source.supabase
    .from(source.table("champion_profiles"))
    .select(withAuthor(PROFILE_BASE, "updated_by"))
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
 * `.range()` paging can't overlap or skip — see lib/team/queries.ts:74-84
 * for the same trap in the table this pattern is copied from.
 */
export async function loadChampionCounters(source: DataSource): Promise<ChampionCounterRow[]> {
  return fetchAllRows<ChampionCounterRow>((from, to) =>
    source.supabase
      .from(source.table("champion_counters"))
      .select(withAuthor(COUNTER_BASE, "created_by"))
      .order("counter_champion_id")
      .order("target_champion_id")
      .range(from, to)
      .returns<ChampionCounterRow[]>(),
  );
}

/**
 * Saved comps and synergies, optionally filtered.
 *
 * One loader for both list pages and, later, the contextual panel — the
 * options are what make a single function worth having. The array filters map
 * to Postgres operators whose directions are easy to get backwards, and
 * getting one backwards returns plausible-looking wrong rows rather than an
 * error, so they're spelled out:
 *
 *   hasAllOf     `@>`  champion_ids contains every id given
 *   hasAnyOf     `&&`  champion_ids and the given ids overlap
 *   containedBy  `<@`  every champion in the row is among the ids given —
 *                      "synergies I've already fully assembled on the board"
 *
 * Ordered `created_at desc, id`: a total order, so `.range()` paging can't
 * overlap or skip. The table is small today, but the ordering discipline costs
 * nothing here and the next person shouldn't have to work it out — see the
 * same trap documented in lib/team/queries.ts:74-84.
 */
export async function loadDraftComps(
  source: DataSource,
  options?: {
    kind?: DraftCompKind;
    hasAllOf?: number[];
    hasAnyOf?: number[];
    containedBy?: number[];
    winConditions?: string[];
  },
): Promise<DraftCompRow[]> {
  return fetchAllRows<DraftCompRow>((from, to) => {
    let query = source.supabase
      .from(source.table("draft_comps"))
      .select(withAuthor(COMP_BASE, "created_by"));
    if (options?.kind) query = query.eq("kind", options.kind);
    if (options?.hasAllOf?.length) query = query.contains("champion_ids", options.hasAllOf);
    if (options?.hasAnyOf?.length) query = query.overlaps("champion_ids", options.hasAnyOf);
    if (options?.containedBy?.length) query = query.containedBy("champion_ids", options.containedBy);
    if (options?.winConditions?.length) {
      query = query.overlaps("win_conditions", options.winConditions);
    }
    return query
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<DraftCompRow[]>();
  });
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
