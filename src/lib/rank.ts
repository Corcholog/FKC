const TIER_ORDER = [
  "CHALLENGER",
  "GRANDMASTER",
  "MASTER",
  "DIAMOND",
  "EMERALD",
  "PLATINUM",
  "GOLD",
  "SILVER",
  "BRONZE",
  "IRON",
];

const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

const DIVISION_WORSENESS: Record<string, number> = { I: 0, II: 1, III: 2, IV: 3 };

export type RankSnapshot = {
  tier: string | null;
  division: string | null;
  league_points: number | null;
  wins: number | null;
  losses: number | null;
};

// Lower key sorts first (i.e. better rank first) — see docs/01_PRD.md §4.3.
export function rankSortKey(p: RankSnapshot): number {
  const tierIndex = p.tier ? TIER_ORDER.indexOf(p.tier) : TIER_ORDER.length;
  const divisionWorseness = p.division ? (DIVISION_WORSENESS[p.division] ?? 0) : 0;
  const lp = p.league_points ?? 0;
  return tierIndex * 10000 + divisionWorseness * 1000 - lp;
}

export function formatRank(tier: string | null, division: string | null): string {
  if (!tier) return "Unranked";
  const label = tier.charAt(0) + tier.slice(1).toLowerCase();
  return APEX_TIERS.has(tier) ? label : `${label} ${division ?? ""}`.trim();
}

export function formatWinLoss(wins: number | null, losses: number | null): string {
  return `${wins ?? 0}W / ${losses ?? 0}L`;
}

export function formatWinRate(wins: number | null, losses: number | null): string {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const total = w + l;
  if (total === 0) return "—";
  return `${Math.round((w / total) * 100)}%`;
}
