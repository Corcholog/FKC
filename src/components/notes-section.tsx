"use client";

import { useActionState, useRef, useState } from "react";
import { addNote, updateNote, deleteNote } from "@/app/(app)/player/[slug]/match/[riotMatchId]/actions";
import { emptyNoteFormState, type NoteFormState } from "@/app/(app)/player/[slug]/match/[riotMatchId]/notes-form-state";
import { formatRelativeTime } from "@/lib/format";
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
  DialogTrigger,
} from "@/components/ui/dialog";

type Note = {
  id: string;
  note: string;
  author_name: string | null;
  created_at: string;
};

function NoteItem({
  note,
  playerId,
}: {
  note: Note;
  playerId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prevState: NoteFormState, formData: FormData) => {
    const result = await updateNote(prevState, formData);
    if (result.success) setEditing(false);
    return result;
  }, emptyNoteFormState);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteNote(note.id, playerId);
      setConfirmOpen(false);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete note.");
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-border bg-bg-tertiary p-3">
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={note.id} />
          <input type="hidden" name="playerId" value={playerId} />
          <Textarea name="note" defaultValue={note.note} required rows={2} className="text-sm" />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} size="sm">
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          {state?.error && <p className="text-xs text-loss">{state.error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-border bg-bg-tertiary p-3">
      <p className="text-sm text-white">{note.note}</p>
      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-xs text-grey-mid">
          {note.author_name ? `${note.author_name} · ` : ""}
          {formatRelativeTime(note.created_at)}
        </p>
        <div className="flex items-center gap-1">
          {deleteError && <p className="text-xs text-loss">{deleteError}</p>}
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger render={<Button type="button" variant="ghost" size="sm" className="text-loss hover:text-danger" />}>
              Delete
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this note?</DialogTitle>
                <DialogDescription>This can&apos;t be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </li>
  );
}

export function NotesSection({
  matchParticipantId,
  playerId,
  notes,
}: {
  matchParticipantId: string;
  playerId: string;
  notes: Note[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prevState: NoteFormState, formData: FormData) => {
    const result = await addNote(prevState, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, emptyNoteFormState);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">Notes</h2>

      {notes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <NoteItem key={n.id} note={n} playerId={playerId} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-grey-mid">No notes yet.</p>
      )}

      <form ref={formRef} action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="matchParticipantId" value={matchParticipantId} />
        <input type="hidden" name="playerId" value={playerId} />
        <Textarea
          name="note"
          placeholder="e.g. died overextending at 14 min, should've backed"
          required
          rows={2}
          className="text-sm"
        />
        <div className="flex items-center gap-2">
          <Input name="authorName" placeholder="Your name (optional)" className="flex-1" />
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add note"}
          </Button>
        </div>
        {state?.error && <p className="text-sm text-loss">{state.error}</p>}
      </form>
    </section>
  );
}
