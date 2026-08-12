import type { ChampionInfo } from "@/lib/ddragon";

// Extracted from champion-combobox.tsx, which had its own copy, and
// tierlist/champion-pool.tsx, which had a near-identical private one. The
// draft simulator's champion grid is the third caller that would otherwise
// have duplicated this — one ranking rule, one place.

// Every match, not a top-N slice — the list scrolls, so an empty field is a
// browsable roster. Prefix hits come first so "sh" offers Shen before Ashe, and
// the codename is searchable too ("kaisa", "monkeyking").
export function suggest<C extends ChampionInfo>(champions: C[], query: string): C[] {
  const q = query.trim().toLowerCase();
  if (!q) return champions;

  const prefix: C[] = [];
  const rest: C[] = [];
  for (const champion of champions) {
    const name = champion.name.toLowerCase();
    const id = champion.ddragonId.toLowerCase();
    if (name.startsWith(q) || id.startsWith(q)) prefix.push(champion);
    else if (name.includes(q) || id.includes(q)) rest.push(champion);
  }
  return [...prefix, ...rest];
}

/**
 * The champion a query unambiguously identifies, or null.
 *
 * **Resolution ranks by match quality; it does not just count `suggest` hits.**
 * `suggest` matches substrings so the list stays browsable, but a substring is
 * not how you identify a champion you're naming: typing "sh" means Shen, and
 * the fact that "Ashe" happens to contain those letters shouldn't block the
 * pick. So the tiers are, in order:
 *
 *   1. an exact hit on the name or the codename — wins outright, even if it
 *      also prefixes something longer
 *   2. exactly one *prefix* match
 *   3. nothing prefixes it at all, but exactly one champion contains it —
 *      covers typing into the middle of a name, and can't reintroduce the
 *      "sh" problem, since a query with prefix candidates never reaches here
 *
 * Anything else is genuinely ambiguous ("a" → Ahri, Akali, Ashe…) and waits
 * for the user. An empty query never resolves.
 *
 * Split out from the component so the rule is testable — it's the thing that
 * decides whether typing two letters commits you to a pick.
 */
export function resolveUnique<C extends ChampionInfo>(
  champions: C[],
  query: string,
  isDisabled?: (champion: C) => boolean,
): C | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const only = (candidates: C[]): C | null =>
    candidates.length === 1 && !isDisabled?.(candidates[0]) ? candidates[0] : null;

  const exact = champions.filter(
    (c) => c.name.toLowerCase() === q || c.ddragonId.toLowerCase() === q,
  );
  if (exact.length > 0) return only(exact);

  const prefix = champions.filter(
    (c) => c.name.toLowerCase().startsWith(q) || c.ddragonId.toLowerCase().startsWith(q),
  );
  if (prefix.length > 0) return only(prefix);

  return only(
    champions.filter((c) => c.name.toLowerCase().includes(q) || c.ddragonId.toLowerCase().includes(q)),
  );
}
