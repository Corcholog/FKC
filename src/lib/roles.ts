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

// Three-letter forms, for places where the role is a column marker rather than
// a label — the scrim draft board puts it between two teams, where "Support"
// would be wider than the gap it sits in.
const ROLE_LABELS_SHORT: Record<string, string> = {
  TOP: "TOP",
  JUNGLE: "JGL",
  MIDDLE: "MID",
  BOTTOM: "BOT",
  UTILITY: "SUP",
};

function roleRank(teamPosition: string | null): number {
  return ROLE_ORDER[teamPosition ?? ""] ?? 5;
}

export function isSupport(teamPosition: string | null): boolean {
  return teamPosition === SUPPORT_POSITION;
}

/**
 * The role someone actually plays — the mode over their team_position values.
 * Games Riot couldn't assign a role to don't vote, and null comes back when
 * none of the rows carried a role at all.
 *
 * Ties break toward the earlier role in ROLE_ORDER, so a player split evenly
 * between two lanes doesn't have their stats flip between renders.
 */
export function mainRole(teamPositions: (string | null)[]): string | null {
  const games = new Map<string, number>();
  for (const position of teamPositions) {
    if (!position || !(position in ROLE_ORDER)) continue;
    games.set(position, (games.get(position) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestGames = 0;
  for (const role of Object.keys(ROLE_ORDER)) {
    const count = games.get(role) ?? 0;
    if (count > bestGames) {
      best = role;
      bestGames = count;
    }
  }
  return best;
}

// Riot leaves teamPosition empty when it can't determine the role.
export function formatRole(teamPosition: string | null): string {
  return ROLE_LABELS[teamPosition ?? ""] ?? "Unknown";
}

/** TOP/JGL/MID/BOT/SUP — for tight columns. Falls back to a dash, not "Unknown". */
export function formatRoleShort(teamPosition: string | null): string {
  return ROLE_LABELS_SHORT[teamPosition ?? ""] ?? "—";
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
