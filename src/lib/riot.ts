// Account-V1 uses regional routing regardless of platform (docs/04_RIOT_API_INTEGRATION.md §1).
const ACCOUNT_REGIONAL_BASE = "https://americas.api.riotgames.com";

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
    throw new RiotApiError(res.status, `Riot API request failed (${res.status})`);
  }
  return res.json();
}

export async function getPuuidByRiotId(gameName: string, tagLine: string, apiKey: string) {
  const url = `${ACCOUNT_REGIONAL_BASE}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const data = (await riotFetch(url, apiKey)) as { puuid: string };
  return data.puuid;
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
