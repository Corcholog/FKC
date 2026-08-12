"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { ChampionInfo } from "@/lib/ddragon";
import {
  compSizeRange,
  DRAFT_COMP_SHAPE,
  MAX_COMP_LABEL_CHARS,
  type DraftCompKind,
  type DraftCompRow,
  type DraftTagRow,
} from "@/lib/draft/types";
import { saveDraftComp } from "@/app/(app)/draft/actions";
import {
  buildCompPayload,
  emptySlot,
  pickedIds,
  seedCompForm,
  type CompFormState,
} from "@/components/draft/comp-form-state";
import { ChampionCombobox } from "@/components/champion-combobox";
import { TagMultiSelect } from "@/components/draft/tag-multi-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Champion = ChampionInfo & { championId: number };

const COPY: Record<DraftCompKind, { noun: string; placeholder: string; hint: string }> = {
  comp: {
    noun: "comp",
    placeholder: "vs UBA",
    hint: "One full side of a draft, in pick order.",
  },
  synergy: {
    noun: "synergy",
    placeholder: "Name (optional)",
    hint: "Two to four champions that work together. The champions are enough — a name is optional.",
  },
};

/**
 * Create or edit one comp or synergy.
 *
 * Mounted conditionally by the caller rather than kept around with an `open`
 * prop — a fresh mount is what makes every opening a clean slate, and it means
 * `comp` can seed the initial state without a sync effect.
 */
export function CompFormDialog({
  kind,
  champions,
  version,
  winConditionTags,
  comp,
  onClose,
}: {
  kind: DraftCompKind;
  champions: Champion[];
  version: string;
  winConditionTags: DraftTagRow[];
  /** The row being edited; omit to create. */
  comp?: DraftCompRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [state, setState] = useState<CompFormState>(() => seedCompForm(kind, comp));

  const [min, max] = compSizeRange(kind);
  const copy = COPY[kind];
  const shape = DRAFT_COMP_SHAPE[kind];
  const taken = pickedIds(state);
  const championById = new Map(champions.map((c) => [c.championId, c]));

  function setSlot(index: number, champion: Champion | null) {
    setState((prev) => ({
      ...prev,
      slots: prev.slots.map((slot, i) =>
        i === index ? { ...slot, championId: champion?.championId ?? null } : slot,
      ),
    }));
  }

  function addSlot() {
    setState((prev) =>
      prev.slots.length >= max ? prev : { ...prev, slots: [...prev.slots, emptySlot()] },
    );
  }

  function removeSlot(index: number) {
    setState((prev) =>
      prev.slots.length <= min
        ? prev
        : { ...prev, slots: prev.slots.filter((_, i) => i !== index) },
    );
  }

  function save() {
    const built = buildCompPayload(state, kind);
    if (!built.ok) {
      toast.error(built.error);
      return;
    }
    startSaving(async () => {
      const result = await saveDraftComp({ ...built.payload, id: comp?.id });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(comp ? "Saved." : `${copy.noun === "comp" ? "Comp" : "Synergy"} saved.`);
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {comp ? `Edit ${copy.noun}` : `New ${copy.noun}`}
          </DialogTitle>
          <DialogDescription>{copy.hint}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            value={state.label}
            onChange={(e) => setState((prev) => ({ ...prev, label: e.target.value }))}
            placeholder={copy.placeholder}
            aria-label="Name"
            maxLength={MAX_COMP_LABEL_CHARS}
            className="h-8 text-sm"
          />

          <div className="flex flex-col gap-1">
            {state.slots.map((slot, i) => (
              <div key={slot.key} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-[10px] tabular-nums text-grey-mid">
                  {i + 1}
                </span>
                <ChampionCombobox
                  label={`Champion ${i + 1}`}
                  champions={champions}
                  version={version}
                  selected={slot.championId === null ? null : championById.get(slot.championId) ?? null}
                  onSelect={(champion) => setSlot(i, champion)}
                  // Greys everything already chosen in another slot and labels
                  // it "taken" — the no-duplicates rule, for free.
                  isDisabled={(c) => c.championId !== slot.championId && taken.has(c.championId)}
                  className="flex-1"
                />
                {state.slots.length > min && (
                  <button
                    type="button"
                    onClick={() => removeSlot(i)}
                    aria-label={`Remove slot ${i + 1}`}
                    className="shrink-0 rounded-sm p-1 text-grey-mid hover:text-loss"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            {state.slots.length < max && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={addSlot}
                className="mt-1 self-start"
              >
                <Plus className="size-3" />
                Add a champion
              </Button>
            )}
          </div>

          {/* Comps only. A synergy is a combo rather than a plan, and there are
              enough of them that tagging every one is work nobody was going to
              do — see DRAFT_COMP_SHAPE. */}
          {shape.winConditions && (
            <TagMultiSelect
              tags={winConditionTags}
              kind="win_condition"
              selected={state.winConditions}
              onChange={(slugs) => setState((prev) => ({ ...prev, winConditions: slugs }))}
              placeholder="Add a win condition"
            />
          )}

          <Textarea
            value={state.notes}
            onChange={(e) => setState((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Notes (optional)"
            aria-label="Notes"
            className="min-h-16 text-sm"
          />
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
