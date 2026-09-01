"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTierList } from "@/app/(app)/prep/tierlists/actions";
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

export function DeleteTierListButton({
  playerId,
  playerName,
  /** Where to go afterwards; stay put and refresh when omitted. */
  redirectTo,
}: {
  playerId: string;
  playerName: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteTierList(playerId);
    setDeleting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setOpen(false);
    toast.success(`${playerName}'s tier list deleted.`);
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="text-loss hover:text-danger" />
        }
      >
        <Trash2 />
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {playerName}&apos;s tier list?</DialogTitle>
          <DialogDescription>
            The whole list goes, tiers and all. This can&apos;t be undone.
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
