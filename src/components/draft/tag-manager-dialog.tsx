"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DraftTagKind, DraftTagRow } from "@/lib/draft/types";
import { createDraftTag, deleteDraftTag, renameDraftTag } from "@/app/(app)/prep/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Add/rename/delete for one tag vocabulary (function or win-condition).
 *
 * A tag can also be created inline from TagMultiSelect's "Create «label»" row
 * — this dialog is for the slower admin operations that component doesn't
 * cover: fixing a typo after the fact, or retiring a tag nobody uses.
 */
export function TagManagerDialog({ tags, kind, label = "Manage tags" }: { tags: DraftTagRow[]; kind: DraftTagKind; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [pending, startTransition] = useTransition();

  function create() {
    const value = newLabel.trim();
    if (!value) return;
    startTransition(async () => {
      const result = await createDraftTag({ label: value, kind });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setNewLabel("");
      router.refresh();
    });
  }

  function saveRename(id: string) {
    const value = editLabel.trim();
    if (!value) return;
    startTransition(async () => {
      const result = await renameDraftTag(id, value);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function remove(tag: DraftTagRow) {
    startTransition(async () => {
      const result = await deleteDraftTag(tag.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`"${tag.label}" removed from every champion that had it.`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>Deleting a tag removes it from every champion that carries it.</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {tags.length === 0 && <p className="p-2 text-sm text-grey-mid">No tags yet.</p>}
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 rounded-sm px-1 py-1 hover:bg-bg-tertiary/40">
              {editingId === tag.id ? (
                <>
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveRename(tag.id)}
                    autoFocus
                    className="h-7 flex-1 text-sm"
                  />
                  <Button type="button" size="xs" onClick={() => saveRename(tag.id)} disabled={pending}>
                    Save
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm text-grey-light">{tag.label}</span>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(tag.id);
                      setEditLabel(tag.label);
                    }}
                    aria-label={`Rename ${tag.label}`}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => remove(tag)}
                    disabled={pending}
                    aria-label={`Delete ${tag.label}`}
                    className="hover:text-loss"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="New tag"
            className="h-8 flex-1 text-sm"
          />
          <Button type="button" size="sm" onClick={create} disabled={pending}>
            <Plus />
            Add
          </Button>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
