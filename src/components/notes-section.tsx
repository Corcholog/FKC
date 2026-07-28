"use client";

import { useActionState, useRef, useState } from "react";
import { addNote, updateNote, deleteNote } from "@/app/(app)/player/[id]/match/[matchId]/actions";
import { emptyNoteFormState, type NoteFormState } from "@/app/(app)/player/[id]/match/[matchId]/notes-form-state";
import { formatRelativeTime } from "@/lib/format";

type Note = {
  id: string;
  note: string;
  author_name: string | null;
  created_at: string;
};

function NoteItem({
  note,
  playerId,
  matchId,
}: {
  note: Note;
  playerId: string;
  matchId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(async (prevState: NoteFormState, formData: FormData) => {
    const result = await updateNote(prevState, formData);
    if (result.success) setEditing(false);
    return result;
  }, emptyNoteFormState);

  async function handleDelete() {
    if (!confirm("Delete this note?")) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteNote(note.id, playerId, matchId);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete note.");
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-md border border-border bg-bg-tertiary p-3">
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={note.id} />
          <input type="hidden" name="playerId" value={playerId} />
          <input type="hidden" name="matchId" value={matchId} />
          <textarea
            name="note"
            defaultValue={note.note}
            required
            rows={2}
            className="rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-sm text-white outline-none focus:border-blue-primary"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-blue-primary px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-bright disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-border px-3 py-1 text-xs text-grey-light transition-colors hover:text-white"
            >
              Cancel
            </button>
          </div>
          {state?.error && <p className="text-xs text-loss">{state.error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-border bg-bg-tertiary p-3">
      <p className="text-sm text-white">{note.note}</p>
      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-xs text-grey-mid">
          {note.author_name ? `${note.author_name} · ` : ""}
          {formatRelativeTime(note.created_at)}
        </p>
        <div className="flex items-center gap-2">
          {deleteError && <p className="text-xs text-loss">{deleteError}</p>}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-grey-light transition-colors hover:text-white"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-loss transition-colors hover:text-white disabled:opacity-50"
          >
            {deleting ? "Removing…" : "Delete"}
          </button>
        </div>
      </div>
    </li>
  );
}

export function NotesSection({
  matchParticipantId,
  playerId,
  matchId,
  notes,
}: {
  matchParticipantId: string;
  playerId: string;
  matchId: string;
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
            <NoteItem key={n.id} note={n} playerId={playerId} matchId={matchId} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-grey-mid">No notes yet.</p>
      )}

      <form ref={formRef} action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="matchParticipantId" value={matchParticipantId} />
        <input type="hidden" name="playerId" value={playerId} />
        <input type="hidden" name="matchId" value={matchId} />
        <textarea
          name="note"
          placeholder="e.g. died overextending at 14 min, should've backed"
          required
          rows={2}
          className="rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-white outline-none focus:border-blue-primary"
        />
        <div className="flex items-center gap-2">
          <input
            name="authorName"
            placeholder="Your name (optional)"
            className="flex-1 rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-white outline-none focus:border-blue-primary"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-bright disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add note"}
          </button>
        </div>
        {state?.error && <p className="text-sm text-loss">{state.error}</p>}
      </form>
    </section>
  );
}
