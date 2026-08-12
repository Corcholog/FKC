"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DRAFT_COMP_KIND_LABELS, type DraftCompKind } from "@/lib/draft/types";
import { deleteDraftComp } from "@/app/(app)/draft/actions";
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

/** Confirm-then-delete, same idiom as scrims/delete-series-button.tsx. */
export function DeleteCompButton({
  compId,
  kind,
  title,
}: {
  compId: string;
  kind: DraftCompKind;
  /** compTitle() — the label, or the champions for an unnamed synergy. */
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteDraftComp(compId);
    setDeleting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setOpen(false);
    toast.success("Deleted.");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Delete ${title}`}
            className="text-grey-mid hover:text-loss"
          />
        }
      >
        <Trash2 className="size-3" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &quot;{title}&quot;?</DialogTitle>
          <DialogDescription>
            {DRAFT_COMP_KIND_LABELS[kind]} gone, along with its notes. Nothing else references it,
            so nothing else changes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
