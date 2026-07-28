const ROLE_ORDER: Record<string, number> = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };

function roleRank(teamPosition: string | null): number {
  return ROLE_ORDER[teamPosition ?? ""] ?? 5;
}

// Standard Top/Jungle/Mid/ADC/Support order — used everywhere a team's 5
// participants are listed together (match history team comps, match detail).
export function sortByRole<T extends { team_position: string | null }>(participants: T[]): T[] {
  return [...participants].sort((a, b) => roleRank(a.team_position) - roleRank(b.team_position));
}
