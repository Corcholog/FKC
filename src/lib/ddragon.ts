// See docs/04_RIOT_API_INTEGRATION.md §6 — championName from match data doesn't
// always match DDragon's internal key (Wukong -> MonkeyKing, Kai'Sa -> Kaisa,
// Renata Glasc -> Renata), so champion_id -> ddragon key must go through this map.

type ChampionListResponse = {
  data: Record<string, { key: string; id: string }>;
};

export async function getLatestVersion(): Promise<string> {
  const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
    next: { revalidate: 86400 },
  });
  const versions = (await res.json()) as string[];
  return versions[0];
}

export async function getChampionMap(version: string): Promise<Map<number, string>> {
  const res = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    { next: { revalidate: 86400 } },
  );
  const body = (await res.json()) as ChampionListResponse;

  const map = new Map<number, string>();
  for (const champ of Object.values(body.data)) {
    map.set(Number(champ.key), champ.id);
  }
  return map;
}

export function championIconUrl(
  championId: number,
  version: string,
  championMap: Map<number, string>,
): string | null {
  const ddragonKey = championMap.get(championId);
  if (!ddragonKey) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${ddragonKey}.png`;
}
