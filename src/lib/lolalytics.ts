// Everything the navbar matchup lookup needs to build a lolalytics.com URL.
// Kept out of lib/ddragon.ts because it's about a third-party site's URL shape,
// not about Riot's asset CDN — the only thing the two share is the champion id.

import { SUPPORT_POSITION, mainRole } from "@/lib/roles";

// Lolalytics keys champions off DDragon's `id`, lowercased with everything
// non-alphanumeric stripped: "Kaisa" → kaisa, "TwistedFate" → twistedfate,
// "JarvanIV" → jarvaniv. The id (not the display name) is what matches — Nunu's
// display name is "Nunu & Willump" but the page is /lol/nunu/, and Renata
// Glasc's is /lol/renata/. Wukong is the one champion whose DDragon id isn't
// what Lolalytics uses.
const SLUG_OVERRIDES: Record<string, string> = { MonkeyKing: "wukong" };

export function lolalyticsSlug(ddragonId: string): string {
  return SLUG_OVERRIDES[ddragonId] ?? ddragonId.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Lolalytics' own lane keys. They line up with Riot's teamPosition values
// (lib/roles.ts) except that UTILITY is spelled "support"; labels here follow
// the app's Top/Jungle/Mid/ADC/Support wording.
export const LOLALYTICS_LANES = [
  { value: "top", label: "Top" },
  { value: "jungle", label: "Jungle" },
  { value: "middle", label: "Mid" },
  { value: "bottom", label: "ADC" },
  { value: "support", label: "Support" },
] as const;

export type LolalyticsLane = (typeof LOLALYTICS_LANES)[number]["value"];

/** Where a signed-in player with no tracked games lands. */
export const DEFAULT_LANE: LolalyticsLane = "top";

const LANE_BY_POSITION: Record<string, LolalyticsLane> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "middle",
  BOTTOM: "bottom",
  [SUPPORT_POSITION]: "support",
};

/** Null for the games where Riot couldn't determine a role. */
export function laneForPosition(teamPosition: string | null): LolalyticsLane | null {
  return LANE_BY_POSITION[teamPosition ?? ""] ?? null;
}

/**
 * The lane a player queues for most, for prefilling the matchup lookup. Just
 * mainRole translated into Lolalytics' spelling, so the lane prefilled here and
 * the role the dashboard's awards are scoped to can't disagree.
 */
export function mainLane(teamPositions: (string | null)[]): LolalyticsLane {
  return laneForPosition(mainRole(teamPositions)) ?? DEFAULT_LANE;
}

// `lane` and `vslane` are always the same value — a matchup is two champions in
// one lane, so there's nothing for the two params to disagree about.
export function lolalyticsMatchupUrl(
  ddragonId: string,
  opponentDdragonId: string,
  lane: LolalyticsLane,
  tier = "master_plus",
): string {
  const champion = lolalyticsSlug(ddragonId);
  const opponent = lolalyticsSlug(opponentDdragonId);
  return `https://lolalytics.com/lol/${champion}/vs/${opponent}/build/?lane=${lane}&tier=${tier}&vslane=${lane}`;
}
