"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ChampionInfo } from "@/lib/ddragon";
import type { ChampionCounterRow } from "@/lib/draft/types";
import { deleteChampionCounter, saveChampionCounter } from "@/app/(app)/draft/actions";
import { ChampionCombobox } from "@/components/champion-combobox";
import { Button } from "@/components/ui/button";
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

function findExisting(
  counters: ChampionCounterRow[],
  counterId: number | undefined,
  targetId: number | undefined,
): ChampionCounterRow | null {
  if (!counterId || !targetId) return null;
  return (
    counters.find((c) => c.counter_champion_id === counterId && c.target_champion_id === targetId) ?? null
  );
}

/**
 * One matchup, add or edit. Always mounted conditionally by its caller (a
 * matrix cell, a champion's "Add" button) rather than kept around with an
 * `open` prop — that's what gives each opening a clean slate: pair `counters`
 * with a `key` on the caller's side and there's nothing here to reset.
 */
export function CounterEditor({
  champions,
  version,
  counters,
  defaultCounterId,
  defaultTargetId,
  onClose,
}: {
  /** Full roster, for both comboboxes. */
  champions: Champion[];
  version: string;
  /** Every noted matchup — used to prefill the note when the picked pair already has one. */
  counters: ChampionCounterRow[];
  defaultCounterId?: number;
  defaultTargetId?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [counter, setCounter] = useState<Champion | null>(
    () => champions.find((c) => c.championId === defaultCounterId) ?? null,
  );
  const [target, setTarget] = useState<Champion | null>(
    () => champions.find((c) => c.championId === defaultTargetId) ?? null,
  );
  const [note, setNote] = useState(
    () => findExisting(counters, defaultCounterId, defaultTargetId)?.note ?? "",
  );

  const existing = findExisting(counters, counter?.championId, target?.championId);

  function selectCounter(next: Champion | null) {
    setCounter(next);
    setNote(findExisting(counters, next?.championId, target?.championId)?.note ?? "");
  }

  function selectTarget(next: Champion | null) {
    setTarget(next);
    setNote(findExisting(counters, counter?.championId, next?.championId)?.note ?? "");
  }

  function save() {
    if (!counter || !target) {
      toast.error("Pick both champions.");
      return;
    }
    startSaving(async () => {
      const result = await saveChampionCounter({
        counterChampionId: counter.championId,
        targetChampionId: target.championId,
        note: note.trim() || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Matchup saved.");
      router.refresh();
      onClose();
    });
  }

  function remove() {
    if (!existing) return;
    startDeleting(async () => {
      const result = await deleteChampionCounter(existing.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Matchup removed.");
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Counter matchup</DialogTitle>
          <DialogDescription>
            Who counters whom, and why — shown on both champions&apos; rows and on the matrix.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <ChampionCombobox
              label="Counters…"
              champions={champions}
              version={version}
              selected={counter}
              onSelect={selectCounter}
              isDisabled={(c) => target?.championId === c.championId}
            />
            <ChampionCombobox
              label="…this champion"
              champions={champions}
              version={version}
              selected={target}
              onSelect={selectTarget}
              isDisabled={(c) => counter?.championId === c.championId}
            />
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why (optional)"
            rows={3}
          />
        </div>

        <DialogFooter>
          {existing && (
            <Button
              type="button"
              variant="destructive"
              onClick={remove}
              disabled={deleting || saving}
              className="sm:mr-auto"
            >
              {deleting ? "Removing…" : "Delete"}
            </Button>
          )}
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="button" onClick={save} disabled={saving || deleting}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
