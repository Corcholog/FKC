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
 * Clear and export. Both are chrome — the caller marks this row
 * `data-exportHide` so neither ends up in the image.
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
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={<Button type="button" size="sm" variant="outline" disabled={!canClear} />}
        >
          <Eraser />
          Clear board
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

      <DownloadPngButton targetId={boardElementId} fileName={fileName} label="Save as PNG" />
    </div>
  );
}
