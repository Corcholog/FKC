const ROLE_ORDER: Record<string, number> = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };

// Riot's teamPosition values are its own internal names for the roles: support
// is "UTILITY" and ADC is "BOTTOM". We store them verbatim in
// match_participants.team_position (same tradeoff as champion_name holding
// "MonkeyKing" for Wukong — see lib/ddragon.ts), so this file owns the raw
// strings and everything else goes through the helpers below.
export const SUPPORT_POSITION = "UTILITY";

const ROLE_LABELS: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "ADC",
  UTILITY: "Support",
};

function roleRank(teamPosition: string | null): number {
  return ROLE_ORDER[teamPosition ?? ""] ?? 5;
}

export function isSupport(teamPosition: string | null): boolean {
  return teamPosition === SUPPORT_POSITION;
}

// Riot leaves teamPosition empty when it can't determine the role.
export function formatRole(teamPosition: string | null): string {
  return ROLE_LABELS[teamPosition ?? ""] ?? "Unknown";
}

// Standard Top/Jungle/Mid/ADC/Support order — used everywhere a team's 5
// participants are listed together (match history team comps, match detail).
export function sortByRole<T extends { team_position: string | null }>(participants: T[]): T[] {
  return [...participants].sort((a, b) => roleRank(a.team_position) - roleRank(b.team_position));
}

type Positioned = { team_id: number; team_position: string | null };

// The enemy in the same lane — the closest thing to a direct opponent Riot's
// data gives us, and the basis for every matchup stat. Null when Riot couldn't
// determine either side's role, which happens on autofill and disconnects.
export function findLaneOpponent<T extends Positioned>(
  participants: T[],
  viewer: Positioned,
): T | null {
  if (!viewer.team_position) return null;
  return (
    participants.find(
      (p) => p.team_id !== viewer.team_id && p.team_position === viewer.team_position,
    ) ?? null
  );
}
