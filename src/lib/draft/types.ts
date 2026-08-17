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

// Riot's own strings, stored verbatim. **Never display these raw, and never
// slice them** — UTILITY is support and BOTTOM is the ADC, so `role.slice(0, 3)`
// renders "UTI" and "BOT" where a player expects "SUP" and "BOT".
// formatRoleShort in lib/roles.ts is the one place that knows the difference.
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
  /** Private only — the demo view drops it and the demo never selects it. */
  updated_by?: string | null;
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

export type ChampionCounterRow = {
  id: string;
  counter_champion_id: number;
  target_champion_id: number;
  note: string | null;
  /** Private only — the demo view drops it and the demo never selects it. */
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export const MAX_COUNTER_NOTE_CHARS = 500;

/** Both readings of champion_counters, built once per page from the raw rows. */
export type CounterIndex = {
  /** championId → the champions it counters. */
  counters: Map<number, ChampionCounterRow[]>;
  /** championId → the champions that counter it. */
  counteredBy: Map<number, ChampionCounterRow[]>;
};

export const DRAFT_COMP_KINDS = ["comp", "synergy"] as const;
export type DraftCompKind = (typeof DRAFT_COMP_KINDS)[number];

/**
 * A comp is one full side of a draft; a synergy is a subset small enough to be
 * a combo rather than a plan. That count is the entire difference between the
 * two kinds, which is why draft_comps_size enforces it in the database as well
 * as here.
 */
export const COMP_SIZE = 5;
export const SYNERGY_MIN_SIZE = 2;
export const SYNERGY_MAX_SIZE = 4;

// Same fields, same app, same reasons as lib/scrims/validate.ts — reused
// rather than reinvented at a slightly different number.
export const MAX_COMP_LABEL_CHARS = 80;
export const MAX_COMP_NOTE_CHARS = 2000;

export type DraftCompRow = {
  id: string;
  kind: DraftCompKind;
  /** Null when unnamed — only a comp is required to have one. */
  label: string | null;
  /** Ordered. For a comp this is the pick order — nothing sorts it. */
  champion_ids: number[];
  win_conditions: string[];
  notes: string | null;
  /** Private only — the demo view drops it and the demo never selects it. */
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export const DRAFT_COMP_KIND_LABELS: Record<DraftCompKind, string> = {
  comp: "Composition",
  synergy: "Synergy",
};

/**
 * What each kind carries, beyond its size.
 *
 * A comp is a plan — one full side of a draft — so it's worth tagging with what
 * it's trying to win on. A synergy is a combo, there are a lot of them, and
 * tagging every one is work nobody was going to do.
 *
 * Neither kind requires a name: the champions are the identity, and a name is
 * worth having when someone has one in mind and friction when they don't. So
 * this isn't in the database at all — no constraint, and `label` is simply
 * nullable. `winConditions` is likewise a product call about what a form asks
 * for rather than a fact about the data, so it lives in validateDraftComp and
 * nothing has to migrate if it changes.
 *
 * `graph` is the same sort of call. Synergies overlap — one champion turns up in
 * six of them and a pair extends into a trio — and that structure is invisible
 * on a wall of cards, which is what the graph view exists to draw. Comps don't
 * have it: every comp is five champions, so nothing properly contains anything,
 * the graph would be one detached region per row and no lines at all, and the
 * "which champions recur" read is what /scrims/drafts already answers over real
 * games rather than over saved plans.
 */
export const DRAFT_COMP_SHAPE: Record<DraftCompKind, { winConditions: boolean; graph: boolean }> = {
  comp: { winConditions: true, graph: false },
  synergy: { winConditions: false, graph: true },
};

/** How many champions this kind takes, as `[min, max]`. */
export function compSizeRange(kind: DraftCompKind): [number, number] {
  return kind === "comp" ? [COMP_SIZE, COMP_SIZE] : [SYNERGY_MIN_SIZE, SYNERGY_MAX_SIZE];
}

/**
 * What to call this row on screen. Falls back to the champions themselves when
 * it's unnamed — "Ornn + Yasuo" is what the thing is, and every surface that
 * needs a title (delete confirmation, aria-label, the search filter) needs
 * *something* rather than each inventing its own placeholder.
 *
 * The card is the exception: it shows the portraits already, so it renders a
 * heading only when there is a real one. See CompCard.
 */
export function compTitle(
  comp: Pick<DraftCompRow, "label" | "champion_ids">,
  nameOf: (championId: number) => string | undefined,
): string {
  if (comp.label) return comp.label;
  return comp.champion_ids.map((id) => nameOf(id) ?? `#${id}`).join(" + ");
}
