// Stop losing the reason a read failed.
//
// Every page in this app was written as `const { data: players } = await
// supabase.from("players").select(...)`, then `players ?? []`. That discards
// `error`, and the two outcomes it collapses together are not remotely the same:
//
//   data: [],   error: null   → there are genuinely no players
//   data: null, error: {...}  → the read failed and nobody will ever know
//
// Both render an empty page. And the failing one renders it *fast*, because
// failing is quicker than returning a few thousand rows — which is exactly the
// symptom that showed up in production: a page that loads unusually quickly with
// every stat blank or showing an em dash.
//
// `fetchAllRows` already throws, so the paged aggregate reads were never part of
// this. It's the single-shot reads — the roster, the rank history, the match
// list — that fail silently, and losing the roster alone is enough to blank a
// whole page since every stat is keyed by player.
//
// There is one failure mode these helpers cannot catch, and it's worth naming
// rather than implying it's covered: **RLS denies by returning zero rows, not an
// error.** If a request ever runs without a valid session, every read here comes
// back as a legitimate-looking empty array. That produces the same blank page and
// nothing below will fire. Ruling it in or out means checking whether a blank
// render coincides with an expired session, which needs the logs these helpers
// are here to start producing.

import type { PostgrestError } from "@supabase/supabase-js";

type Result<T> = { data: T | null; error: PostgrestError | null };

function describe(what: string, error: PostgrestError): string {
  // Code and hint included on purpose: they are what separates the plausible
  // causes from each other in a log. 57014 is a statement timeout (the
  // authenticator role runs with statement_timeout=8s), 42501 is a permission
  // problem, PGRST301 is an expired JWT, and an exhausted connection pool
  // arrives as a connection error. Guessing between those from "the page was
  // blank" is impossible; the code makes it a lookup.
  const parts = [`${what} read failed`, error.message];
  if (error.code) parts.push(`code ${error.code}`);
  if (error.hint) parts.push(error.hint);
  return parts.join(" — ");
}

/**
 * Rows, or a thrown error naming what failed.
 *
 * For data the page is *about*. A thrown error reaches (app)/error.tsx, which
 * offers a retry and prints a digest that matches the server log — an honest
 * "this broke" instead of a page that looks like it has nothing to show.
 *
 * `what` should name the table or the concept, because it's the only context the
 * log will have: "roster", "rank history", "scrim picks".
 */
export function rows<T>(result: Result<T[]>, what: string): T[] {
  if (result.error) throw new Error(describe(what, result.error));
  return result.data ?? [];
}

/**
 * A single row, or null when there genuinely isn't one.
 *
 * Only for `.maybeSingle()`, where "no row" is a normal answer and comes back as
 * `data: null, error: null`. `.single()` turns a missing row into an error
 * (PGRST116) and would throw here, which is usually what you want from it.
 */
export function maybeRow<T>(result: Result<T>, what: string): T | null {
  if (result.error) throw new Error(describe(what, result.error));
  return result.data;
}

/**
 * For reads whose failure must not take the page down.
 *
 * The narrow case is chrome rendered by a layout: (app)/layout.tsx reads
 * sync_state for the key-expired banner on every single navigation, and a
 * layout that throws is caught by global-error.tsx, not the page-level boundary
 * — so one failed banner read would replace the entire app with a full-screen
 * error instead of a page missing one banner.
 *
 * The other case is content that is genuinely an extra on the page it sits on,
 * where "render without it" beats "render nothing". The AI summary card is the
 * only one so far: the player page is about the numbers, and a summary that
 * failed to load should cost the reader a paragraph, not the page.
 *
 * Logs rather than swallows, so the failure still exists somewhere. Do not reach
 * for this to quiet a page read; that's the bug this file exists to fix.
 */
export function optional<T>(result: Result<T>, what: string, fallback: T): T {
  if (result.error) {
    console.error(describe(what, result.error));
    return fallback;
  }
  return result.data ?? fallback;
}
