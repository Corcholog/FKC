"use client";

import { useState } from "react";
import { Eraser } from "lucide-react";
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

/**
 * Clear and export, as two icons.
 *
 * These live *inside* the exported region now — tucked into the corner of the
 * ban panel, where they cost no vertical space of their own — so this row
 * carries `data-export-hide` itself rather than relying on sitting outside it.
 * Icon-only, so both carry an aria-label and a title; an icon button with no
 * accessible name is just a mystery box.
 *
 * Clearing goes behind a confirmation because it's one click away from twenty
 * slots of work and there is no undo. Same idiom as
 * scrims/delete-series-button.tsx.
 */
export function DraftControls({
  boardElementId,
  fileName,
  canClear,
  onClear,
}: {
  boardElementId: string;
  fileName: string;
  canClear: boolean;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1" data-export-hide>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={!canClear}
              aria-label="Clear board"
              title="Clear board"
            />
          }
        >
          <Eraser />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear the whole board?</DialogTitle>
            <DialogDescription>
              Every ban and pick on both sides goes. There&apos;s no undo — to empty one slot
              instead, right-click it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DownloadPngButton
        targetId={boardElementId}
        fileName={fileName}
        label="Save as PNG"
        iconOnly
      />
    </div>
  );
}
