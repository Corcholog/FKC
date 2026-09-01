// Server-side validation for the draft strategy tables.
//
// Lives here rather than inside the action for the same reason
// lib/team/validate.ts does: a "use server" module may only export async
// functions, so anything in there is unreachable from another caller. This is
// the copy that counts — server actions are reachable by direct POST, not only
// through our own form.

import {
  compSizeRange,
  COMP_SIZE,
  DRAFT_COMP_KINDS,
  DRAFT_COMP_SHAPE,
  DRAFT_ROLES,
  DRAFT_TAG_KINDS,
  MAX_COMP_LABEL_CHARS,
  MAX_COMP_NOTE_CHARS,
  MAX_COUNTER_NOTE_CHARS,
  MAX_PROFILE_NOTE_CHARS,
  MAX_TAGS_PER_CHAMPION,
  MAX_TAG_LABEL_CHARS,
  SYNERGY_MAX_SIZE,
  SYNERGY_MIN_SIZE,
  type DraftCompKind,
} from "@/lib/draft/types";

export function cleanText(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export type ChampionProfileInput = {
  championId: number;
  roles: string[];
  tags: string[];
  notes: string | null;
};

/** The first thing wrong with this profile, or null if it's sound. */
export function validateChampionProfile(
  input: ChampionProfileInput,
  validChampionIds: Set<number>,
  validTagSlugs: Set<string>,
): string | null {
  if (!validChampionIds.has(input.championId)) return "That champion isn't recognized.";

  if (new Set(input.roles).size !== input.roles.length) return "A role is listed twice.";
  for (const role of input.roles) {
    if (!(DRAFT_ROLES as readonly string[]).includes(role)) return "Unknown role.";
  }

  if (input.tags.length > MAX_TAGS_PER_CHAMPION) {
    return `A champion can carry at most ${MAX_TAGS_PER_CHAMPION} tags.`;
  }
  if (new Set(input.tags).size !== input.tags.length) return "A tag is listed twice.";
  for (const slug of input.tags) {
    if (!validTagSlugs.has(slug)) return "That tag doesn't exist. Add it first.";
  }

  if (input.notes && input.notes.length > MAX_PROFILE_NOTE_CHARS) {
    return `Notes can't be longer than ${MAX_PROFILE_NOTE_CHARS} characters.`;
  }

  return null;
}

export type DraftTagInput = {
  label: string;
  kind: string;
};

/** The first thing wrong with this tag, or null if it's sound. */
export function validateDraftTag(input: DraftTagInput): string | null {
  const label = cleanText(input.label, MAX_TAG_LABEL_CHARS);
  if (!label) return "A tag needs a label.";
  if (!(DRAFT_TAG_KINDS as readonly string[]).includes(input.kind)) return "Unknown tag kind.";
  return null;
}

export type CounterGroupInput = {
  /** The champion held constant — the one every row in the list relates to. */
  fixedChampionId: number;
  /**
   * "counteredBy": `fixed` is the target, every row is a champion that
   * counters it — "who's a good response to Jarvan". "counters": `fixed` is
   * the counter, every row is a target it beats — "what does Jarvan answer
   * well". Same table, opposite column held fixed.
   */
  direction: "counters" | "counteredBy";
  rows: { championId: number; note: string | null }[];
};

/** The first thing wrong with this group of matchups, or null if it's sound. */
export function validateCounterGroup(
  input: CounterGroupInput,
  validChampionIds: Set<number>,
): string | null {
  if (!validChampionIds.has(input.fixedChampionId)) return "That champion isn't recognized.";

  if (new Set(input.rows.map((r) => r.championId)).size !== input.rows.length) {
    return "The same champion is listed twice.";
  }
  for (const row of input.rows) {
    if (!validChampionIds.has(row.championId)) return "That champion isn't recognized.";
    if (row.championId === input.fixedChampionId) return "A champion can't counter itself.";
    if (row.note && row.note.length > MAX_COUNTER_NOTE_CHARS) {
      return `Notes can't be longer than ${MAX_COUNTER_NOTE_CHARS} characters.`;
    }
  }

  return null;
}

export type DraftCompInput = {
  kind: DraftCompKind;
  /** Null or blank is fine for a synergy — see DRAFT_COMP_SHAPE. */
  label: string | null;
  /** Ordered — the pick order for a comp. Never sorted, here or anywhere. */
  championIds: number[];
  winConditions: string[];
  notes: string | null;
};

/**
 * The first thing wrong with this comp or synergy, or null if it's sound.
 *
 * The size rule duplicates draft_comps_size on purpose: the constraint exists
 * to protect the data from anything that isn't this code, and this exists to
 * produce a sentence a person can act on instead of a Postgres constraint
 * dump. The duplicate-champion rule is *only* here — cardinality() doesn't
 * dedupe, so the database will happily store the same champion twice, and a
 * side of a draft cannot field one champion twice.
 */
export function validateDraftComp(
  input: DraftCompInput,
  validChampionIds: Set<number>,
  validWinConditionSlugs: Set<string>,
): string | null {
  if (!(DRAFT_COMP_KINDS as readonly string[]).includes(input.kind)) return "Unknown kind.";
  const shape = DRAFT_COMP_SHAPE[input.kind];

  // No name is required on either kind — the champions identify the row, and
  // cleanText turns a blank one into null so "" is never stored.
  if ((input.label?.trim().length ?? 0) > MAX_COMP_LABEL_CHARS) {
    return `The name can't be longer than ${MAX_COMP_LABEL_CHARS} characters.`;
  }

  if (!shape.winConditions && input.winConditions.length > 0) {
    // Unreachable from the form, which doesn't render the field for this kind.
    // Rejecting rather than silently dropping: a direct POST that sets them is
    // asking for something this kind doesn't do, and saying so beats storing
    // tags no surface will ever show.
    return "Synergies don't carry win conditions.";
  }

  const [min, max] = compSizeRange(input.kind);
  if (input.championIds.length < min || input.championIds.length > max) {
    return input.kind === "comp"
      ? `A comp is a full side — pick ${COMP_SIZE} champions.`
      : `A synergy holds ${SYNERGY_MIN_SIZE} to ${SYNERGY_MAX_SIZE} champions.`;
  }

  if (new Set(input.championIds).size !== input.championIds.length) {
    return "The same champion is picked twice.";
  }
  for (const id of input.championIds) {
    if (!validChampionIds.has(id)) return "That champion isn't recognized.";
  }

  if (new Set(input.winConditions).size !== input.winConditions.length) {
    return "A win condition is listed twice.";
  }
  for (const slug of input.winConditions) {
    if (!validWinConditionSlugs.has(slug)) return "That win condition doesn't exist. Add it first.";
  }

  if (input.notes && input.notes.length > MAX_COMP_NOTE_CHARS) {
    return `Notes can't be longer than ${MAX_COMP_NOTE_CHARS} characters.`;
  }

  return null;
}
