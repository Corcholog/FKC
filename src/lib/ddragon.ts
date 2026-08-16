// Riot's match-data championName field is actually the internal codename, not
// the display name (Wukong's is "MonkeyKing", Kai'Sa's is "Kaisa", Renata
// Glasc's is "Renata") — it happens to match DDragon's `id` (used for icon
// URLs) exactly, which is why icon lookups have always been correct here.
// The real display name only lives in DDragon's `name` field, so anywhere we
// show champion text to a person must go through this map too, not the raw
// stored champion_name column. See docs/04_RIOT_API_INTEGRATION.md §6.

export type ChampionInfo = { ddragonId: string; name: string };

type ChampionListResponse = {
  data: Record<string, { key: string; id: string; name: string }>;
};

// Both DDragon fetches are awaited in the (app) layout, so an unguarded failure
// here doesn't break a card — it takes down every authenticated page at once.
// That made this the widest-blast-radius call in the app and the only external
// one without error handling (Riot, Gemini and Supabase all have it).
//
// Neither of these is load-bearing: champion *names* fall back to the stored
// codename via championDisplayName, and championIconUrl already returns null on
// a miss. So the right failure mode is to degrade — codenames and missing icons
// — rather than to throw and let an error boundary blank the page.
//
// The version only reaches icon URLs, which are already 404-tolerant, so a
// slightly stale pin costs nothing during an outage.
const FALLBACK_VERSION = "16.15.1";

/**
 * A cached DDragon GET that degrades instead of throwing.
 *
 * The retry exists because of the cache, not the network: a non-ok response can
 * be stored in the fetch cache for the full revalidate window, which would pin
 * the app in degraded mode for 24 hours after a blip that lasted seconds. One
 * uncached retry on the failure path only costs a request while DDragon is
 * actually down, and makes recovery immediate instead of next-day.
 */
async function fetchDDragon<T>(url: string, what: string): Promise<T | null> {
  for (const init of [{ next: { revalidate: 86400 } }, { cache: "no-store" as const }]) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) continue;
      return (await res.json()) as T;
    } catch {
      // Network error or malformed JSON — same handling either way.
    }
  }
  console.error(`DDragon: could not load ${what} from ${url}; falling back.`);
  return null;
}

export async function getLatestVersion(): Promise<string> {
  const versions = await fetchDDragon<string[]>(
    "https://ddragon.leagueoflegends.com/api/versions.json",
    "the patch list",
  );
  return versions?.[0] ?? FALLBACK_VERSION;
}

// DDragon's champion list isn't only Summoner's Rift champions: as of 16.15 it
// also carries 60 game-mode variants (ids prefixed "Jade_", keys 60001-60117)
// that share their base champion's display name. They'd show up as duplicates
// in a picker and have no Lolalytics page, so anything listing champions for a
// person to choose from filters on the key range — real champions are 1-950.
const MAX_REAL_CHAMPION_KEY = 10_000;

/** Every real champion on the current patch, alphabetical by display name. */
export async function getChampionList(version: string): Promise<ChampionInfo[]> {
  return realChampions(await getChampionMap(version));
}

/**
 * Same filtering and ordering as getChampionList, but keeps the numeric key —
 * anything that has to line up champions with stored champion_id values (the
 * tier list board) needs it.
 */
export function realChampions(
  map: Map<number, ChampionInfo>,
): Array<ChampionInfo & { championId: number }> {
  return [...map.entries()]
    .filter(([key]) => key < MAX_REAL_CHAMPION_KEY)
    .map(([championId, info]) => ({ championId, ...info }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getChampionMap(version: string): Promise<Map<number, ChampionInfo>> {
  const body = await fetchDDragon<ChampionListResponse>(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    "the champion list",
  );

  // An empty map is the degraded state, not a bug: every consumer already
  // handles a miss. It does mean the champion pickers (tier list, matchup
  // search) render empty while DDragon is down.
  const map = new Map<number, ChampionInfo>();
  for (const champ of Object.values(body?.data ?? {})) {
    map.set(Number(champ.key), { ddragonId: champ.id, name: champ.name });
  }
  return map;
}

export function championIconUrlById(ddragonId: string, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${ddragonId}.png`;
}

/**
 * The patch a DDragon version belongs to: `"15.3.1"` → `"15.3"`.
 *
 * DDragon versions carry a third segment that is a *build* rather than a patch —
 * it moves for asset fixes that nobody playing would call a new patch — and
 * `scrim_games.patch` wants the two-part number everyone says out loud. Keeping
 * the build would also split one patch's games across several values, which is
 * the one thing a patch filter cannot survive.
 *
 * Returns the input unchanged if it doesn't look like a version, rather than
 * inventing one — the caller uses this to *prefill* a field somebody can edit.
 */
export function patchFromVersion(version: string): string {
  const match = version.match(/^(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : version;
}

/**
 * The grey "no champion" portrait, for an empty slot on the draft board.
 *
 * **This one is not DDragon.** DDragon has no such asset — `img/champion/-1.png`,
 * `None.png` and `0.png` all 403 — so it comes from CommunityDragon, which is
 * the only extra host this app talks to and exists solely for this icon. It
 * serves `Access-Control-Allow-Origin: *`, so it works with
 * `crossOrigin="anonymous"` and won't taint the canvas during the board's PNG
 * export, which is the one thing that would have ruled it out.
 *
 * Unversioned (`latest`) because there is no patch-specific version of an empty
 * square, and because the failure mode is a missing decoration: the slot still
 * renders its border and label, so a 404 here costs nothing.
 */
export const EMPTY_CHAMPION_ICON_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/-1.png";

export function championIconUrl(
  championId: number,
  version: string,
  championMap: Map<number, ChampionInfo>,
): string | null {
  const info = championMap.get(championId);
  if (!info) return null;
  return championIconUrlById(info.ddragonId, version);
}

// Falls back to the raw stored name (Riot's internal codename) only if the
// champion is somehow missing from the current patch's DDragon data.
export function championDisplayName(
  championId: number,
  championMap: Map<number, ChampionInfo>,
  fallback: string,
): string {
  return championMap.get(championId)?.name ?? fallback;
}
