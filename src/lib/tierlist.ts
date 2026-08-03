// Shared shape and rules for the hand-made champion tier lists (/tierlists).
//
// Imported by the client board, the server actions and the read path alike, so
// the constraints exist once. The database stores `tiers` as unvalidated jsonb —
// normalizeTiers below is the whole validation layer, and it runs on read as
// well as write: stored rows can outlive the champion they mention, and a jsonb
// column can hold anything if something ever writes to it outside the app.

export type Tier = {
  id: string;
  label: string;
  color: string;
  championIds: number[];
};

/** One draggable champion, flattened out of ddragon's map for the client. */
export type TierChampion = {
  championId: number;
  ddragonId: string;
  name: string;
};

/** Just enough of ChampionAgg to draw the hover chip. */
export type TierChampionStat = { games: number; wins: number };

// The classic tiermaker ramp, red through blue. Bright pastels rather than the
// app's hextech palette on purpose: this is the one thing on the site that is
// supposed to look like a tier list from the internet, and the row colours are
// how you read it at a glance. Everything around them stays dark.
export const TIER_PALETTE = [
  "#ff7f7f",
  "#ffbf7f",
  "#ffdf7f",
  "#ffff7f",
  "#bfff7f",
  "#7fff7f",
  "#7fffff",
  "#bfbfff",
  "#ff7fff",
] as const;

// Bright enough that white text on them is unreadable — labels are always drawn
// in the page background colour instead.
export const TIER_LABEL_TEXT = "#0a0d12";

export const MAX_TIERS = 12;
export const MAX_LABEL_CHARS = 12;

/** A fresh list: S down to D on the first five colours. */
export function defaultTiers(): Tier[] {
  return ["S", "A", "B", "C", "D"].map((label, i) => ({
    id: newTierId(),
    label,
    color: TIER_PALETTE[i],
    championIds: [],
  }));
}

// crypto.randomUUID exists in both the browser and Node 20, but ids only have to
// be unique within one document and short ids are far easier to read in the
// jsonb column when debugging.
export function newTierId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Coerces anything into a safe Tier[].
 *
 * Drops champion ids that aren't on the current patch, de-dupes a champion that
 * somehow appears twice (the first placement wins, so the earlier/higher tier
 * keeps it), caps tier count and label length, and rejects colours that aren't
 * in TIER_PALETTE. Returns [] for input that isn't an array at all.
 *
 * `validChampionIds` is the key set from ddragon's getChampionMap().
 */
export function normalizeTiers(raw: unknown, validChampionIds: Set<number>): Tier[] {
  if (!Array.isArray(raw)) return [];

  const seenChampions = new Set<number>();
  const seenTierIds = new Set<string>();
  const tiers: Tier[] = [];

  for (const entry of raw.slice(0, MAX_TIERS)) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;

    // A duplicated tier id would collide as a drag-and-drop container key, so
    // it's reassigned rather than dropped — the tier's contents are still fine.
    let id = asString(candidate.id).slice(0, 32);
    if (!id || seenTierIds.has(id)) id = newTierId();
    seenTierIds.add(id);

    const color = TIER_PALETTE.find((c) => c === candidate.color) ?? TIER_PALETTE[0];

    const championIds: number[] = [];
    if (Array.isArray(candidate.championIds)) {
      for (const value of candidate.championIds) {
        const championId = typeof value === "number" ? value : Number(value);
        if (!Number.isInteger(championId)) continue;
        if (!validChampionIds.has(championId)) continue;
        if (seenChampions.has(championId)) continue;
        seenChampions.add(championId);
        championIds.push(championId);
      }
    }

    tiers.push({
      id,
      // Trimmed but not required: an empty label is a legitimate unnamed row.
      label: asString(candidate.label).trim().slice(0, MAX_LABEL_CHARS),
      color,
      championIds,
    });
  }

  return tiers;
}

/** Narrows the /champions aggregates down to what the hover chip needs. */
export function statMap(
  aggs: Array<{ championId: number; games: number; wins: number }>,
): Map<number, TierChampionStat> {
  return new Map(aggs.map((a) => [a.championId, { games: a.games, wins: a.wins }]));
}

/** Every champion placed anywhere, for deriving the unranked pool. */
export function placedChampionIds(tiers: Tier[]): Set<number> {
  const placed = new Set<number>();
  for (const tier of tiers) {
    for (const championId of tier.championIds) placed.add(championId);
  }
  return placed;
}

export function countPlaced(tiers: Tier[]): number {
  return placedChampionIds(tiers).size;
}
