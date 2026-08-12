// Row shapes and vocabulary for the draft strategy tables — champion
// annotations, the counter matrix, and saved comps/synergies.
//
// The snake_case is deliberate, same call as lib/scrims/types.ts: these are
// PostgREST rows, not app-shaped objects. DRAFT_ROLES reuses Riot's own
// TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY strings so sortByRole/formatRole
// (lib/roles.ts) work on champion_profiles.roles with no adapter, exactly the
// reason scrim_picks.team_position does the same.

export const DRAFT_TAG_KINDS = ["function", "win_condition"] as const;
export type DraftTagKind = (typeof DRAFT_TAG_KINDS)[number];

export const DRAFT_ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type DraftRole = (typeof DRAFT_ROLES)[number];

export type DraftTagRow = {
  id: string;
  slug: string;
  label: string;
  kind: DraftTagKind;
  created_at: string;
};

export type ChampionProfileRow = {
  champion_id: number;
  roles: string[];
  tags: string[];
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

/** The editable fields of a profile, without the row's DB metadata. */
export type ChampionProfileFields = {
  roles: string[];
  tags: string[];
  notes: string | null;
};

/**
 * A profile with nothing in it isn't worth a row — see the comment on
 * champion_profiles in migration 015. Both the client (for what counts as
 * "annotated") and the server action (for whether to upsert or delete) share
 * this exact rule so the two can't disagree about what "empty" means.
 */
export function isEmptyProfile(fields: ChampionProfileFields): boolean {
  return fields.roles.length === 0 && fields.tags.length === 0 && !fields.notes;
}

export const MAX_TAG_LABEL_CHARS = 40;
export const MAX_PROFILE_NOTE_CHARS = 1000;
export const MAX_TAGS_PER_CHAMPION = 12;
