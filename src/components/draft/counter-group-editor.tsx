"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { ChampionInfo } from "@/lib/ddragon";
import type { ChampionCounterRow } from "@/lib/draft/types";
import { saveCounterGroup } from "@/app/(app)/prep/actions";
import { ChampionAvatar } from "@/components/champion-avatar";
import { ChampionCombobox } from "@/components/champion-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
type Direction = "counters" | "counteredBy";
type Row = { championId: number; note: string };

function seedRows(
  counters: ChampionCounterRow[],
  fixedId: number,
  direction: Direction,
  champions: Champion[],
): Row[] {
  const byId = new Map(champions.map((c) => [c.championId, c]));
  return counters
    .filter((c) =>
      direction === "counteredBy" ? c.target_champion_id === fixedId : c.counter_champion_id === fixedId,
    )
    .map((c) => ({
      championId: direction === "counteredBy" ? c.counter_champion_id : c.target_champion_id,
      note: c.note ?? "",
    }))
    .sort((a, b) => (byId.get(a.championId)?.name ?? "").localeCompare(byId.get(b.championId)?.name ?? ""));
}

const COPY: Record<Direction, { verb: string; hint: (name: string) => string }> = {
  counteredBy: {
    verb: "Good picks against",
    hint: (name) => `Champions that answer ${name} well — add as many as you've got.`,
  },
  counters: {
    verb: "is a good pick against",
    hint: (name) => `Champions ${name} answers well.`,
  },
};

/**
 * Add, re-note or remove several matchups on one side of a champion in a
 * single save — "against Jarvan there are multiple good responses" is one
 * dialog keyed on Jarvan (`fixed`, held constant), with one row per champion
 * on the other side of the relation. Replaces the old one-pair-at-a-time
 * CounterEditor everywhere: a matrix cell, a champion's "Add" button and an
 * existing list entry all open this same view, because editing one relation
 * and adding five are really the same action — the full list for `fixed`.
 *
 * Always mounted conditionally by the caller rather than kept around with an
 * `open` prop — a fresh mount is what gives every opening a clean slate.
 */
export function CounterGroupEditor({
  champions,
  version,
  counters,
  direction,
  fixedChampionId,
  onClose,
}: {
  /** Full roster, for both the initial picker and the add-combobox. */
  champions: Champion[];
  version: string;
  /** Every noted matchup — seeds the list and is diffed against on save. */
  counters: ChampionCounterRow[];
  direction: Direction;
  /** Omit to have the dialog ask which champion first — the toolbar's blank entry point. */
  fixedChampionId?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [fixed, setFixed] = useState<Champion | null>(
    () => champions.find((c) => c.championId === fixedChampionId) ?? null,
  );
  const [rows, setRows] = useState<Row[]>(() =>
    fixed ? seedRows(counters, fixed.championId, direction, champions) : [],
  );
  const [addKey, setAddKey] = useState(0);

  const championById = new Map(champions.map((c) => [c.championId, c]));

  function pickFixed(champion: Champion | null) {
    if (!champion) return;
    setFixed(champion);
    setRows(seedRows(counters, champion.championId, direction, champions));
  }

  function addRow(champion: Champion | null) {
    if (!champion || !fixed) return;
    if (champion.championId === fixed.championId) return;
    if (rows.some((r) => r.championId === champion.championId)) return;
    setRows((prev) => [...prev, { championId: champion.championId, note: "" }]);
    setAddKey((k) => k + 1); // remounts the add combobox so it clears
  }

  function removeRow(championId: number) {
    setRows((prev) => prev.filter((r) => r.championId !== championId));
  }

  function setNote(championId: number, note: string) {
    setRows((prev) => prev.map((r) => (r.championId === championId ? { ...r, note } : r)));
  }

  function save() {
    if (!fixed) return;
    startSaving(async () => {
      const result = await saveCounterGroup({
        fixedChampionId: fixed.championId,
        direction,
        rows: rows.map((r) => ({ championId: r.championId, note: r.note.trim() || null })),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved.");
      router.refresh();
      onClose();
    });
  }

  const copy = fixed ? COPY[direction] : null;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{fixed ? `${copy!.verb} ${fixed.name}` : "Which champion?"}</DialogTitle>
          <DialogDescription>
            {fixed ? copy!.hint(fixed.name) : "Pick a champion, then add as many responses as you've got."}
          </DialogDescription>
        </DialogHeader>

        {!fixed ? (
          <ChampionCombobox
            label="Champion"
            champions={champions}
            version={version}
            selected={null}
            onSelect={pickFixed}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {rows.length === 0 && <p className="p-2 text-sm text-grey-mid">Nothing added yet.</p>}
              {rows.map((row) => {
                const champion = championById.get(row.championId);
                if (!champion) return null;
                return (
                  <div key={row.championId} className="flex items-center gap-2">
                    <ChampionAvatar champion={champion} version={version} size="sm" className="shrink-0" />
                    <span className="w-28 shrink-0 truncate text-sm text-grey-light">{champion.name}</span>
                    <Input
                      value={row.note}
                      onChange={(e) => setNote(row.championId, e.target.value)}
                      placeholder="Why (optional)"
                      aria-label={`Why ${champion.name}`}
                      className="h-8 flex-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(row.championId)}
                      aria-label={`Remove ${champion.name}`}
                      className="shrink-0 rounded-sm p-1 text-grey-mid hover:text-loss"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <ChampionCombobox
              key={addKey}
              label="Add a champion…"
              champions={champions}
              version={version}
              selected={null}
              onSelect={addRow}
              isDisabled={(c) => c.championId === fixed.championId || rows.some((r) => r.championId === c.championId)}
            />
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          {fixed && (
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
