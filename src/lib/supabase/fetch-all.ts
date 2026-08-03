// Bounded reads for the unbounded aggregate queries.
//
// Two separate PostgREST limits bite the "select every participant row and fold
// it in JS" pattern this app uses on the dashboard, /team, /champions,
// /insights and the player page:
//
// 1. **Max rows.** Supabase caps every response at the project's "Max rows"
//    setting (1000 by default) and *truncates silently* — no error, no flag.
//    An aggregate built on a truncated read isn't slow or partial, it's wrong,
//    and it looks exactly like a correct one. This is the reason this file
//    exists.
//
// 2. **URL length.** `.in("match_id", ids)` serialises every id into the query
//    string. At ~36 bytes per uuid, a few hundred matches is several KB of URL
//    and starts colliding with the 8KB header limits proxies impose — a 414,
//    which at least fails loudly, but fails.
//
// Neither is a scaling worry for later: both are a function of history size,
// and the roster accumulates history every day.
//
// This deliberately does NOT move aggregation into Postgres. That's still the
// right end state (docs/engineering/10-known-gaps.md §2) and still unbuilt; the
// point here is only that the reads feeding the current JS aggregation have to
// stop lying about how much they returned.

import type { PostgrestError } from "@supabase/supabase-js";

/** Rows requested per round trip. Kept at PostgREST's own default ceiling. */
const PAGE_SIZE = 1000;

/**
 * Match ids per `.in()` call. 90 ids is ~3.3KB of uuids in the query string,
 * comfortably inside every proxy's header limit with room for the rest of the
 * URL.
 */
const IN_CHUNK_SIZE = 90;

type PageResult<T> = { data: T[] | null; error: PostgrestError | null };

/** A query with `.range(from, to)` applied — everything else already bound. */
export type RangedQuery<T> = (from: number, to: number) => PromiseLike<PageResult<T>>;

/**
 * Runs a query to exhaustion, one page at a time.
 *
 * Strides by how many rows actually came back rather than by PAGE_SIZE, and
 * stops only on an empty page. That's what makes it correct without knowing the
 * project's Max rows setting: if the cap is lower than PAGE_SIZE, a "full" page
 * is short, and a `page.length < PAGE_SIZE` termination check would quietly
 * stop at the first page and reintroduce the exact bug this is here to fix.
 *
 * The cost is one extra empty round trip per call, which is the correct trade
 * against silently wrong stats.
 */
export async function fetchAllRows<T>(query: RangedQuery<T>): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; ) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = data ?? [];
    if (page.length === 0) break;

    rows.push(...page);
    from += page.length;
  }

  return rows;
}

/**
 * Same, for a query filtered by a list of ids that may be too long for one URL.
 *
 * Chunks are sequential rather than `Promise.all`'d: these run inside a page
 * render against the free tier, and a burst of parallel PostgREST requests is a
 * worse neighbour than a few extra milliseconds of latency.
 */
export async function fetchAllByIds<T>(
  ids: string[],
  query: (chunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  if (ids.length === 0) return [];

  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE);
    rows.push(...(await fetchAllRows<T>((from, to) => query(chunk, from, to))));
  }
  return rows;
}
