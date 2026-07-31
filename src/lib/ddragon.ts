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

export async function getLatestVersion(): Promise<string> {
  const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
    next: { revalidate: 86400 },
  });
  const versions = (await res.json()) as string[];
  return versions[0];
}

// DDragon's champion list isn't only Summoner's Rift champions: as of 16.15 it
// also carries 60 game-mode variants (ids prefixed "Jade_", keys 60001-60117)
// that share their base champion's display name. They'd show up as duplicates
// in a picker and have no Lolalytics page, so anything listing champions for a
// person to choose from filters on the key range — real champions are 1-950.
const MAX_REAL_CHAMPION_KEY = 10_000;

/** Every real champion on the current patch, alphabetical by display name. */
export async function getChampionList(version: string): Promise<ChampionInfo[]> {
  const map = await getChampionMap(version);
  return [...map.entries()]
    .filter(([key]) => key < MAX_REAL_CHAMPION_KEY)
    .map(([, info]) => info)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getChampionMap(version: string): Promise<Map<number, ChampionInfo>> {
  const res = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    { next: { revalidate: 86400 } },
  );
  const body = (await res.json()) as ChampionListResponse;

  const map = new Map<number, ChampionInfo>();
  for (const champ of Object.values(body.data)) {
    map.set(Number(champ.key), { ddragonId: champ.id, name: champ.name });
  }
  return map;
}

export function championIconUrlById(ddragonId: string, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${ddragonId}.png`;
}

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
