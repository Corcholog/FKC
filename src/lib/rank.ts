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

// Standard League rank-tier colors, used for the home page's per-tier card
// border — a deliberate exception to the blue/navy/grey palette, same
// reasoning as win/loss and the key-expiry warning: rank identity is exactly
// what these colors exist to communicate at a glance.
const TIER_COLORS: Record<string, string> = {
  IRON: "#5d5a56",
  BRONZE: "#a9702d",
  SILVER: "#9fa8b2",
  GOLD: "#e0b64d",
  PLATINUM: "#4fd1c5",
  EMERALD: "#2ecc71",
  DIAMOND: "#5aa9e6",
  MASTER: "#a855c9",
  GRANDMASTER: "#e74c3c",
  CHALLENGER: "#ffe66d",
};

export function rankTierColor(tier: string | null): string {
  return (tier && TIER_COLORS[tier]) || "var(--color-border)";
}

export function isApexTier(tier: string | null): boolean {
  return !!tier && APEX_TIERS.has(tier);
}

// Index === how much worse the division is, best first. Both the sort key and
// the chart's ladder scale read from this, so it stays the single source.
const DIVISIONS_BEST_FIRST = ["I", "II", "III", "IV"];

const DIVISION_WORSENESS: Record<string, number> = Object.fromEntries(
  DIVISIONS_BEST_FIRST.map((d, i) => [d, i]),
);

// Just the ladder position. Split out from RankSnapshot because
// player_rank_history rows are read without their W/L columns.
export type RankPosition = {
  tier: string | null;
  division: string | null;
  league_points: number | null;
};

export type RankSnapshot = RankPosition & {
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

// One division is 100 LP, so a tier (4 divisions) spans 400 — which makes tier
// boundaries land on clean multiples and gives the LP chart free gridlines.
const LP_PER_DIVISION = 100;
const DIVISIONS_PER_TIER = DIVISIONS_BEST_FIRST.length;
export const LP_PER_TIER = LP_PER_DIVISION * DIVISIONS_PER_TIER;

// Master is where divisions stop and LP becomes unbounded, so every apex tier
// shares one band starting here and is separated by raw LP alone.
const APEX_BASE = (TIER_ORDER.length - TIER_ORDER.indexOf("MASTER") - 1) * LP_PER_TIER;

// A continuous, higher-is-better ladder position — the y-axis for the LP chart.
// The inverse of rankSortKey, which sorts lower-is-better for list ordering.
// Unranked returns null rather than 0, so a gap in the series renders as a gap
// instead of a plunge to Iron IV.
export function ladderPoints(p: RankPosition): number | null {
  if (!p.tier) return null;

  const tierIndex = TIER_ORDER.indexOf(p.tier);
  if (tierIndex === -1) return null;

  const lp = p.league_points ?? 0;
  if (APEX_TIERS.has(p.tier)) return APEX_BASE + lp;

  const divisionWorseness = p.division ? (DIVISION_WORSENESS[p.division] ?? 0) : 0;
  const tierBase = (TIER_ORDER.length - 1 - tierIndex) * LP_PER_TIER;
  return tierBase + (DIVISIONS_PER_TIER - 1 - divisionWorseness) * LP_PER_DIVISION + lp;
}

// Turns a y-axis value back into a readable rank for chart ticks and tooltips.
export function formatLadderPoints(value: number): string {
  // Above Master the three apex tiers share one LP scale with no divisions and
  // no fixed cutoffs (GM/Challenger are decided by ladder position, not LP), so
  // a value alone can't name the tier.
  if (value >= APEX_BASE) return `Master+ ${Math.round(value - APEX_BASE)} LP`;

  const tier = TIER_ORDER[TIER_ORDER.length - 1 - Math.floor(value / LP_PER_TIER)];
  if (!tier) return "Unranked";

  const withinTier = value % LP_PER_TIER;
  const worseness = DIVISIONS_PER_TIER - 1 - Math.floor(withinTier / LP_PER_DIVISION);

  return formatRank(tier, DIVISIONS_BEST_FIRST[worseness] ?? null);
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
