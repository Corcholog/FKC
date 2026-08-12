// State shape and payload building for the comp/synergy form.
//
// Kept out of the component for the same reason scrims/draft-form-state.ts is:
// the fiddly parts — how many slots a kind gets, what counts as already
// picked, turning half-filled slots into the action's payload — are worth
// having as plain functions rather than closures inside the dialog.
//
// The validation here is the *fast* copy, the one that avoids a round trip to
// be told something obvious. src/lib/draft/validate.ts is the copy that counts:
// server actions are reachable by direct POST, not only through this form.

import {
  compSizeRange,
  DRAFT_COMP_SHAPE,
  type DraftCompKind,
  type DraftCompRow,
} from "@/lib/draft/types";
import type { DraftCompInput } from "@/lib/draft/validate";

export type CompFormState = {
  label: string;
  /**
   * One entry per slot, in order — null is an empty slot. Order is preserved
   * all the way to the database: for a comp it's the pick order.
   *
   * Slots carry a `key` so a field can be reset by remounting it.
   * ChampionCombobox has no effect syncing its text from `selected`, by design
   * (see its comment at line 55), so changing the key is how a field clears.
   */
  slots: { key: string; championId: number | null }[];
  winConditions: string[];
  notes: string;
};

let slotSeq = 0;
export function emptySlot(): { key: string; championId: number | null } {
  slotSeq += 1;
  return { key: `slot-${slotSeq}`, championId: null };
}

/** A blank form for `kind`, or one seeded from a saved row for editing. */
export function seedCompForm(kind: DraftCompKind, comp?: DraftCompRow | null): CompFormState {
  const [min] = compSizeRange(kind);
  if (!comp) {
    return {
      label: "",
      slots: Array.from({ length: min }, emptySlot),
      winConditions: [],
      notes: "",
    };
  }
  return {
    label: comp.label ?? "",
    slots: comp.champion_ids.map((id) => ({ ...emptySlot(), championId: id })),
    winConditions: [...comp.win_conditions],
    notes: comp.notes ?? "",
  };
}

/** Champions already chosen elsewhere in the form — the combobox greys these. */
export function pickedIds(state: CompFormState): Set<number> {
  const ids = new Set<number>();
  for (const slot of state.slots) if (slot.championId !== null) ids.add(slot.championId);
  return ids;
}

export type BuildResult =
  | { ok: true; payload: DraftCompInput }
  | { ok: false; error: string };

/**
 * The form as the action wants it, or the first reason it isn't ready.
 *
 * Empty slots are rejected rather than dropped: silently saving a four-champion
 * "comp" because one field was left blank is exactly the kind of quiet data
 * loss the size constraint exists to prevent.
 */
export function buildCompPayload(state: CompFormState, kind: DraftCompKind): BuildResult {
  const shape = DRAFT_COMP_SHAPE[kind];
  const label = state.label.trim();
  if (shape.requiresLabel && !label) {
    return { ok: false, error: "Give it a name first — which draft was this?" };
  }

  const [min, max] = compSizeRange(kind);
  if (state.slots.length < min || state.slots.length > max) {
    return { ok: false, error: `Pick ${min === max ? min : `${min} to ${max}`} champions.` };
  }
  if (state.slots.some((s) => s.championId === null)) {
    return { ok: false, error: "One of the champion slots is still empty." };
  }

  const championIds = state.slots.map((s) => s.championId as number);
  if (new Set(championIds).size !== championIds.length) {
    return { ok: false, error: "The same champion is picked twice." };
  }

  return {
    ok: true,
    payload: {
      kind,
      label: label || null,
      championIds,
      // The form doesn't render the field for a kind that doesn't use them, but
      // state can survive a kind that did — drop rather than send.
      winConditions: shape.winConditions ? state.winConditions : [],
      notes: state.notes.trim() || null,
    },
  };
}
