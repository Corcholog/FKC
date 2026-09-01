"use client";

import { useActionState, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { addNote, updateNote, deleteNote } from "@/app/(app)/notes/actions";
import { emptyNoteFormState, type NoteFormState } from "@/app/(app)/notes/form-state";
import { formatRelativeTime } from "@/lib/format";
import type { MatchNote } from "@/lib/match-notes";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
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

type Note = MatchNote;

function NoteItem({
  note,
  playerId,
  authorLabel,
  isOwn,
}: {
  note: Note;
  playerId: string;
  authorLabel: string | null;
  isOwn: boolean;
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
      await deleteNote(note.id);
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
          {authorLabel ? `${authorLabel} · ` : ""}
          {formatRelativeTime(note.created_at)}
        </p>
        {isOwn && (
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
        )}
      </div>
    </li>
  );
}

export function NotesSection({
  matchParticipantId,
  playerId,
  playerName,
  notes,
  canAddNote,
  currentUserId,
  matchInfoUrl,
}: {
  matchParticipantId: string;
  playerId: string;
  /** Display name of the player whose game this is — the only person who can write here. */
  playerName: string;
  notes: Note[];
  canAddNote: boolean;
  currentUserId: string | null;
  /** External scoreboard for this game, or null when the match id has no
   * recognisable platform prefix — see leagueOfGraphsMatchUrl. */
  matchInfoUrl: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prevState: NoteFormState, formData: FormData) => {
    const result = await addNote(prevState, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, emptyNoteFormState);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide text-grey-light uppercase">Notes</h3>
        {matchInfoUrl && (
          // A plain anchor wearing the button's classes rather than
          // <Button render={<a/>}> — nothing here wants button semantics, and
          // it keeps button-only props off the link. New tab, because opening
          // the full scoreboard shouldn't cost you your place in the history.
          <a
            href={matchInfoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Match info
            <ExternalLink />
          </a>
        )}
      </div>

      {notes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              playerId={playerId}
              // Only this player can write here, so an owned note is theirs;
              // older notes predate logins and fall back to the free-text name.
              authorLabel={n.author_user_id ? playerName : n.author_name}
              isOwn={currentUserId !== null && n.author_user_id === currentUserId}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-grey-mid">
          {canAddNote ? "No notes yet — add one below." : `${playerName} hasn't added any notes to this game.`}
        </p>
      )}

      {canAddNote && (
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
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add note"}
            </Button>
          </div>
          {state?.error && <p className="text-sm text-loss">{state.error}</p>}
        </form>
      )}
    </section>
  );
}
