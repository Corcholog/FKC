// LeagueOfGraphs slugs its URLs by the community region name, not by Riot's
// platform routing value: a game whose id starts with LA2 lives at
// /match/las/<id>. Only that row is verified — it's the one the whole roster
// plays on (settings/actions.ts hardcodes platform LA2). The rest are
// best-effort, which is why an unknown prefix returns null instead of guessing.
const LOG_REGION_BY_PLATFORM: Record<string, string> = {
  LA2: "las",
  LA1: "lan",
  NA1: "na",
  EUW1: "euw",
  EUN1: "eune",
  KR: "kr",
  BR1: "br",
  OC1: "oce",
  RU: "ru",
  TR1: "tr",
  JP1: "jp",
  ME1: "me",
};

/**
 * External match page for a Riot match id like `LA2_1614083959`.
 *
 * The platform comes from the id's own prefix rather than `players.platform`:
 * it's the platform the game was actually played on, it stays right if the
 * roster ever spans servers, and it needs no extra column in any page's select.
 *
 * Returns null when the id has no recognisable prefix, so callers can drop the
 * link rather than send someone to the wrong server.
 */
export function leagueOfGraphsMatchUrl(riotMatchId: string): string | null {
  const [platform, gameId] = riotMatchId.split("_");
  const region = LOG_REGION_BY_PLATFORM[platform];
  if (!region || !gameId) return null;
  return `https://www.leagueofgraphs.com/match/${region}/${gameId}`;
}
