"use client";

import { useState } from "react";
import { Eraser, Link2, PanelRight, Trash2, Users } from "lucide-react";
import { DownloadPngButton } from "@/components/tierlist/download-png-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Confirm-then-do, for the two clears. Same idiom as delete-series-button.tsx. */
function ConfirmButton({
  icon,
  label,
  title,
  description,
  confirmLabel,
  disabled,
  onConfirm,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            disabled={disabled}
            aria-label={label}
            title={label}
          />
        }
      >
        {icon}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Clear this game, clear the whole series, export the visible game.
 *
 * These live *inside* the exported region — tucked into the corner of the ban
 * panel, where they cost no vertical space of their own — so this row carries
 * `data-export-hide` itself rather than relying on sitting outside it.
 * Icon-only, so each carries an aria-label and a title; an icon button with no
 * accessible name is a mystery box.
 *
 * Both clears confirm first: each is one click away from work with no undo, and
 * the series one is worded to name how many games it takes with it, so the
 * bigger of the two is obviously the bigger of the two.
 */
export function DraftControls({
  boardElementId,
  fileName,
  gameNumber,
  canClearGame,
  gamesWithContent,
  onClearGame,
  onClearSeries,
  canSaveComp,
  canSaveSynergy,
  onSaveComp,
  onSaveSynergy,
  contextOpen,
  onToggleContext,
}: {
  boardElementId: string;
  fileName: string;
  gameNumber: number;
  canClearGame: boolean;
  /** How many games in the series have anything on them. */
  gamesWithContent: number;
  onClearGame: () => void;
  onClearSeries: () => void;
  /** A side of the visible game has all five picks. */
  canSaveComp: boolean;
  /** A side of the visible game has at least two picks. */
  canSaveSynergy: boolean;
  onSaveComp: () => void;
  onSaveSynergy: () => void;
  /** The reference panel is showing. */
  contextOpen: boolean;
  onToggleContext: () => void;
}) {
  return (
    <div className="flex items-center gap-1" data-export-hide>
      {/* First, and the only toggle in this row rather than an action: it's the
          one control here you press *before* drafting rather than after. */}
      <Button
        type="button"
        size="icon-sm"
        variant={contextOpen ? "default" : "outline"}
        onClick={onToggleContext}
        aria-pressed={contextOpen}
        aria-label="Draft reference panel"
        title="Champions, counters, comps and synergies against this board"
      >
        <PanelRight />
      </Button>

      {/* The saves read as primary against the clears and the export, because
          they're the reason to have drafted anything here. Disabled states say
          what's missing rather than just refusing — a greyed button with no
          explanation reads as broken. */}
      <Button
        type="button"
        size="icon-sm"
        disabled={!canSaveComp}
        onClick={onSaveComp}
        aria-label="Save composition"
        title={
          canSaveComp
            ? "Save a side's five picks as a composition"
            : "Fill one side's five picks to save a composition"
        }
      >
        <Users />
      </Button>

      <Button
        type="button"
        size="icon-sm"
        disabled={!canSaveSynergy}
        onClick={onSaveSynergy}
        aria-label="Save synergy"
        title={
          canSaveSynergy
            ? "Pick two to four champions from one side"
            : "Two picks on one side are needed to save a synergy"
        }
      >
        <Link2 />
      </Button>

      <ConfirmButton
        icon={<Eraser />}
        label={`Clear game ${gameNumber}`}
        title={`Clear game ${gameNumber}?`}
        description={`Every ban and pick on both sides of game ${gameNumber} goes. The rest of the series is untouched, and there's no undo — to empty one slot instead, right-click it.`}
        confirmLabel="Clear game"
        disabled={!canClearGame}
        onConfirm={onClearGame}
      />

      <ConfirmButton
        icon={<Trash2 />}
        label="Clear the whole series"
        title="Clear the whole series?"
        description={`All five games, including the ${gamesWithContent} with something on ${gamesWithContent === 1 ? "it" : "them"}. There's no undo.`}
        confirmLabel="Clear series"
        disabled={gamesWithContent === 0}
        onConfirm={onClearSeries}
      />

      <DownloadPngButton
        targetId={boardElementId}
        fileName={fileName}
        label={`Save game ${gameNumber} as PNG`}
        iconOnly
      />
    </div>
  );
}
