// Server-side validation for the draft strategy tables.
//
// Lives here rather than inside the action for the same reason
// lib/scrims/validate.ts does: a "use server" module may only export async
// functions, so anything in there is unreachable from another caller. This is
// the copy that counts — server actions are reachable by direct POST, not only
// through our own form.

import { DRAFT_ROLES, DRAFT_TAG_KINDS, MAX_PROFILE_NOTE_CHARS, MAX_TAGS_PER_CHAMPION, MAX_TAG_LABEL_CHARS } from "@/lib/draft/types";

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
