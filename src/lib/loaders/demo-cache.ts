import { unstable_cache } from "next/cache";

// How the demo pages avoid paying a Supabase read per visitor.
//
// The obvious way to do this is `export const revalidate = 3600` on the page.
// It doesn't work here: with no dynamic API in the tree, Next prerenders such a
// page **at build time**, which means `next build` connects to Supabase. CI
// builds with a placeholder project URL precisely because nothing is supposed to
// be contacted at build time (.github/workflows/ci.yml), so an ISR demo page
// turns a green pipeline red for reasons that have nothing to do with the code.
//
// So the pages stay dynamic (`export const dynamic = "force-dynamic"`) and the
// *data* is cached instead. Same effect for the thing that actually matters —
// a link that gets passed around a coaching staff costs one read an hour rather
// than one per person — with no build-time database dependency.
//
// `unstable_cache` rather than `"use cache"`: the newer directive needs
// `cacheComponents: true` in next.config.ts, which changes the rendering model
// for every existing route in the app. Not a change to make in passing for the
// demo's benefit.

/**
 * One hour. The sync cron runs once a day at 07:00 Buenos Aires, so anything
 * shorter is spending reads to re-fetch a number that cannot have moved.
 */
export const DEMO_REVALIDATE_SECONDS = 3600;

/**
 * Wraps a demo loader in the data cache.
 *
 * `key` has to be unique per loader — it is the cache key, and two loaders
 * sharing one would serve each other's rows.
 *
 * **What goes through here must survive serialization.** A cache entry is
 * written to disk and read back, so a `Map` returned from a loader arrives as a
 * plain `{}` on the second request and every `.get()` on it throws. The trap is
 * that the *first* request is a cache miss and works perfectly, so this looks
 * fine locally and breaks for the second visitor.
 *
 * The rule that avoids it: cache the rows, fold them afterwards. Loaders in this
 * folder are therefore split into a `fetchXRows` (plain arrays, cacheable) and a
 * pure `buildX` (Maps and whatever else the page wants), which also matches how
 * the rest of the codebase separates fetching from computing.
 */
export function cachedDemoLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
  return unstable_cache(load, ["demo", key], {
    revalidate: DEMO_REVALIDATE_SECONDS,
    tags: ["demo"],
  })();
}
