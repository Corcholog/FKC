// Match-V5 and Account-V1 use regional routing; League-V4 uses platform routing.
// See docs/04_RIOT_API_INTEGRATION.md §1.
const REGIONAL_BASE = "https://americas.api.riotgames.com";

const PLATFORM_BASES: Record<string, string> = {
  LA2: "https://la2.api.riotgames.com",
};

export class RiotApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function riotFetch(url: string, apiKey: string) {
  const res = await fetch(url, { headers: { "X-Riot-Token": apiKey } });
  if (!res.ok) {
    throw new RiotApiError(res.status, `Riot API request failed (${res.status}) for ${url}`);
  }
  return res.json();
}

export async function getPuuidByRiotId(gameName: string, tagLine: string, apiKey: string) {
  const url = `${REGIONAL_BASE}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const data = (await riotFetch(url, apiKey)) as { puuid: string };
  return data.puuid;
}

export async function getRankedSoloMatchIds(
  puuid: string,
  apiKey: string,
  { start = 0, count = 20 }: { start?: number; count?: number } = {},
) {
  const url = `${REGIONAL_BASE}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&start=${start}&count=${count}`;
  return (await riotFetch(url, apiKey)) as string[];
}

export type MatchParticipantDto = {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  teamId: number;
  teamPosition?: string; // TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY, "" if Riot couldn't determine it
  championId: number;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalDamageDealtToChampions: number;
  goldEarned: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  gameEndedInEarlySurrender: boolean;
};

export type MatchDto = {
  info: {
    queueId: number;
    gameCreation: number;
    gameDuration: number;
    gameVersion: string;
    participants: MatchParticipantDto[];
  };
};

export async function getMatchById(matchId: string, apiKey: string) {
  const url = `${REGIONAL_BASE}/lol/match/v5/matches/${matchId}`;
  return (await riotFetch(url, apiKey)) as MatchDto;
}

export type LeagueEntryDto = {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
};

export async function getRankedSoloEntry(puuid: string, platform: string, apiKey: string) {
  const base = PLATFORM_BASES[platform] ?? PLATFORM_BASES.LA2;
  const url = `${base}/lol/league/v4/entries/by-puuid/${puuid}`;
  const entries = (await riotFetch(url, apiKey)) as LeagueEntryDto[];
  return entries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? null;
}

// Shared mapping from a caught RiotApiError to a message safe to show in the admin UI.
export function describeRiotError(e: unknown, gameName: string, tagLine: string): string {
  if (e instanceof RiotApiError) {
    if (e.status === 401 || e.status === 403) {
      return "Riot API key is invalid or expired — update sync_state.riot_api_key in Supabase.";
    }
    if (e.status === 404) {
      return `No Riot account found for ${gameName}#${tagLine}.`;
    }
    return `Riot API error (${e.status}). Try again in a moment.`;
  }
  return e instanceof Error ? e.message : "Riot API lookup failed.";
}
