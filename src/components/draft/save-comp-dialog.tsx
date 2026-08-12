"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ChampionInfo } from "@/lib/ddragon";
import type { Side } from "@/lib/draft/board";
import {
  DRAFT_COMP_SHAPE,
  MAX_COMP_LABEL_CHARS,
  type DraftCompKind,
  type DraftTagRow,
} from "@/lib/draft/types";
import { saveDraftComp } from "@/app/(app)/draft/actions";
import { ChampionAvatar } from "@/components/champion-avatar";
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
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };

/** One savable set of champions, and which side of the board it came off. */
export type CompSource = { side: Side; championIds: number[] };

const SIDE_LABEL: Record<Side, string> = { blue: "Blue", red: "Red" };

const COPY: Record<DraftCompKind, { title: string; hint: string; placeholder: string }> = {
  comp: {
    title: "Save this composition",
    hint: "The five picks of one side, in the order they were drafted.",
    placeholder: "vs UBA — G2 blue",
  },
  synergy: {
    title: "Save this synergy",
    hint: "The champions you selected, saved as a combo.",
    placeholder: "Wombo Orianna",
  },
};

/**
 * Writes a comp or synergy straight off the board.
 *
 * Calls Phase 3's `saveDraftComp` unchanged — that action takes its kind in the
 * payload and assumes nothing about where the champions came from precisely so
 * this could exist without a second write path into the same table.
 *
 * **Saving changes nothing about the board.** No clear, no navigate, no
 * deselect. Someone who just saved blue is usually about to save red and keep
 * drafting, and any state change costs them what they were doing. Same call as
 * OpponentNotesForm saving in place with a toast.
 */
export function SaveCompDialog({
  kind,
  sources,
  championById,
  version,
  winConditionTags,
  onClose,
}: {
  kind: DraftCompKind;
  /** One entry per savable side. More than one shows a side chooser. */
  sources: CompSource[];
  championById: Map<number, Champion>;
  version: string;
  winConditionTags: DraftTagRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [sourceIndex, setSourceIndex] = useState(0);
  const [label, setLabel] = useState("");
  const [winConditions, setWinConditions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const copy = COPY[kind];
  const shape = DRAFT_COMP_SHAPE[kind];
  const source = sources[sourceIndex] ?? sources[0];

  function save() {
    // Snapshot before the transition, not inside it: the board is live and can
    // change under an in-flight save otherwise.
    const payload = {
      kind,
      label: label.trim() || null,
      championIds: [...source.championIds],
      winConditions: shape.winConditions ? winConditions : [],
      notes: notes.trim() || null,
    };

    startSaving(async () => {
      const result = await saveDraftComp(payload);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const where = kind === "comp" ? "/draft/comps" : "/draft/synergies";
      toast.success(kind === "comp" ? "Composition saved." : "Synergy saved.", {
        action: { label: "View", onClick: () => router.push(where) },
      });
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.hint}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Only when both sides qualify. With one there's nothing to choose,
              and a disabled toggle is worse than no toggle. */}
          {sources.length > 1 && (
            <div className="flex items-center gap-1">
              {sources.map((s, i) => (
                <Button
                  key={s.side}
                  type="button"
                  size="sm"
                  variant={i === sourceIndex ? "default" : "outline"}
                  onClick={() => setSourceIndex(i)}
                  aria-pressed={i === sourceIndex}
                >
                  {SIDE_LABEL[s.side]}
                </Button>
              ))}
            </div>
          )}

          {/* Not optional. The dialog covers the board, so without this "did I
              save blue or red" is unanswerable until you visit /draft/comps.
              It's five avatars. */}
          <div
            className={cn(
              "flex flex-wrap gap-1 rounded-sm p-2",
              source.side === "blue" ? "bg-cyan/10" : "bg-loss/10",
            )}
          >
            {source.championIds.map((id, i) => {
              const champion = championById.get(id);
              return champion ? (
                <ChampionAvatar
                  key={`${id}-${i}`}
                  champion={champion}
                  version={version}
                  size="md"
                />
              ) : null;
            })}
          </div>

          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={copy.placeholder}
            aria-label="Name (optional)"
            maxLength={MAX_COMP_LABEL_CHARS}
            autoFocus
            className="h-8 text-sm"
          />

          {shape.winConditions && (
            <TagMultiSelect
              tags={winConditionTags}
              kind="win_condition"
              selected={winConditions}
              onChange={setWinConditions}
              placeholder="Add a win condition"
            />
          )}

          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
