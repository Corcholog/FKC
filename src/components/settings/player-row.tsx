"use client";

import { useActionState, useState } from "react";
import { updatePlayer, deletePlayer } from "@/app/(app)/settings/actions";
import { emptyPlayerFormState, type PlayerFormState } from "@/app/(app)/settings/form-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Player = {
  id: string;
  riot_game_name: string;
  riot_tag_line: string;
  display_name: string;
  avatar_url: string | null;
};

export function PlayerRow({ player }: { player: Player }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(async (prevState: PlayerFormState, formData: FormData) => {
    const result = await updatePlayer(prevState, formData);
    if (result.success) {
      setEditing(false);
      setResultMessage(result.message ?? null);
    }
    return result;
  }, emptyPlayerFormState);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePlayer(player.id);
      setConfirmOpen(false);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to remove player.");
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-border bg-bg-tertiary p-4">
        <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <input type="hidden" name="id" value={player.id} />

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-grey-light">Game name</Label>
            <Input name="gameName" defaultValue={player.riot_game_name} required />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-grey-light">Tag line</Label>
            <Input name="tagLine" defaultValue={player.riot_tag_line} required className="w-24" />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-grey-light">Display name</Label>
            <Input name="displayName" defaultValue={player.display_name} required />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-grey-light">New avatar</Label>
            <input
              name="avatar"
              type="file"
              accept="image/*"
              className="text-xs text-grey-light file:mr-2 file:rounded file:border-0 file:bg-gold-muted file:px-2 file:py-1 file:text-white"
            />
          </div>

          {player.avatar_url && (
            <label className="flex items-center gap-1.5 text-xs text-grey-light">
              <input type="checkbox" name="removeAvatar" />
              Remove avatar
            </label>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending} size="sm">
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>

          {state?.error && <p className="w-full text-sm text-loss">{state.error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-bg-tertiary p-3 transition-colors hover:bg-bg-tertiary/70">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar>
            {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
            <AvatarFallback>{player.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{player.display_name}</p>
            <p className="truncate text-xs text-grey-light">
              {player.riot_game_name}#{player.riot_tag_line}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {deleteError && <p className="text-xs text-loss">{deleteError}</p>}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setResultMessage(null);
              setEditing(true);
            }}
          >
            Edit
          </Button>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger render={<Button type="button" variant="ghost" size="sm" className="text-loss hover:text-danger" />}>
              Remove
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove {player.display_name}?</DialogTitle>
                <DialogDescription>
                  This also deletes their notes and AI summary. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Removing…" : "Remove"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {resultMessage && <p className="text-xs text-grey-light">{resultMessage}</p>}
    </li>
  );
}
