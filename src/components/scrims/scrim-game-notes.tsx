"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CornerDownRight, Loader2, MessageSquarePlus, Reply } from "lucide-react";
import { toast } from "sonner";
import {
  addScrimGameNote,
  updateScrimGameNote,
  deleteScrimGameNote,
} from "@/app/(app)/scrims/actions";
import { formatRelativeTime } from "@/lib/format";
import type { ScrimNoteThread, ThreadedNote } from "@/lib/scrims/notes";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

// The review thread under a scrim game's draft.
//
// Everyone signed in can add a note or answer one — all five played the game —
// but only the author can edit or delete their own, which is also what RLS
// enforces. That split is deliberate and differs from the rest of the scrim
// tables, where anyone may fix anyone's typo: a mis-entered champion is shared
// data, a written opinion isn't.
//
// Any note can be replied to, including a reply. What's capped is the drawing,
// not the data: the thread renders two visual levels, and an answer to an answer
// says whose it is rather than indenting again (see `replyingTo` in
// lib/scrims/notes.ts). A tree of indents inside a board already carrying twenty
// champion portraits is unreadable by the third level on a phone.
//
// useTransition + toast rather than useActionState, matching the other scrim
// forms (OpponentNotesForm, DeleteSeriesButton). The older NotesSection uses
// useActionState because it's a FormData action; these take typed arguments.

/** How many replies stay visible before the toggle hides the rest. */
const REPLIES_SHOWN_COLLAPSED = 1;

function NoteComposer({
  placeholder,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  /** Resolves true when the write landed, so the composer knows to clear. */
  onSubmit: (text: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, startSaving] = useTransition();

  function submit() {
    const text = draft.trim();
    if (!text) {
      toast.error("Write something first.");
      return;
    }
    startSaving(async () => {
      if (await onSubmit(text)) setDraft("");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        rows={2}
        aria-label={submitLabel}
        autoFocus={autoFocus}
        className="text-sm"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function NoteBody({
  note,
  isOwn,
  isReply,
  onReply,
  onChanged,
}: {
  note: ThreadedNote;
  isOwn: boolean;
  isReply?: boolean;
  onReply: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.note);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, startBusy] = useTransition();

  function save() {
    const text = draft.trim();
    if (!text) {
      toast.error("Write something first.");
      return;
    }
    startBusy(async () => {
      const result = await updateScrimGameNote(note.id, text);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setEditing(false);
      onChanged();
    });
  }

  function remove() {
    startBusy(async () => {
      const result = await deleteScrimGameNote(note.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setConfirmOpen(false);
      toast.success("Note deleted.");
      onChanged();
    });
  }

  const shell = cn(
    "rounded-lg border border-border bg-bg-tertiary",
    isReply ? "p-2" : "p-2.5",
  );

  if (editing) {
    return (
      <div className={shell}>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          aria-label="Edit note"
          className="text-sm"
        />
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" onClick={save} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              // Discard the edit rather than keeping it — a cancelled draft
              // reappearing next time you click Edit reads as a failed save.
              setDraft(note.note);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      {/* Only when the target isn't the thread's root: everything under a note
          answers it by default, so saying so on every reply is noise. This
          fires for the deeper answers, where the indent no longer shows who. */}
      {note.replyingTo && (
        <p className="mb-0.5 flex items-center gap-1 text-[11px] text-grey-mid">
          <Reply className="h-3 w-3 shrink-0" />
          <span className="truncate">
            replying to <span className="text-grey-light">{note.replyingTo}</span>
          </span>
        </p>
      )}
      <p className={cn("whitespace-pre-wrap text-white", isReply ? "text-[13px]" : "text-sm")}>
        {note.note}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="truncate text-xs text-grey-mid">
          {note.authorLabel && <span className="text-grey-light">{note.authorLabel}</span>}
          {note.authorLabel && <span className="mx-1 opacity-50">·</span>}
          {formatRelativeTime(note.created_at)}
          {/* Only when it actually differs — updated_at is set on insert, so
              comparing to created_at is the only way to tell an edited note
              from a new one. */}
          {note.updated_at !== note.created_at && " · edited"}
        </p>

        <span className="flex shrink-0 items-center gap-1">
          {/* On replies too, not just roots — answering an answer is the normal
              shape of a review argument. Where it *lands* is threadNotes' call,
              not this button's. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReply}
            className="text-grey-mid hover:text-gold-bright"
          >
            <Reply />
            Reply
          </Button>

          {isOwn && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                // Seed from the note as it stands now, not from whatever this
                // component last held: the row survives a router.refresh(), so
                // a note edited elsewhere would otherwise open with stale text.
                onClick={() => {
                  setDraft(note.note);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-loss hover:text-danger"
                    />
                  }
                >
                  Delete
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete this note?</DialogTitle>
                    <DialogDescription>
                      {/* Answers cascade with the note they hang under, at every
                          depth, so say so before it happens rather than after. */}
                      {note.descendantCount
                        ? `The ${note.descendantCount} ${note.descendantCount === 1 ? "reply" : "replies"} under it go too. This can't be undone.`
                        : "This can't be undone."}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button type="button" variant="outline" />}>
                      Cancel
                    </DialogClose>
                    <Button type="button" variant="destructive" onClick={remove} disabled={busy}>
                      {busy ? "Deleting…" : "Delete"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function NoteThread({
  thread,
  gameId,
  currentUserId,
  onChanged,
}: {
  thread: ScrimNoteThread;
  gameId: string;
  currentUserId: string | null;
  onChanged: () => void;
}) {
  // Which note the composer is answering — not a boolean, because Reply now
  // sits on every note in the thread and the parent id is what distinguishes
  // them. Null closes it.
  const [replyTo, setReplyTo] = useState<ThreadedNote | null>(null);
  const [expanded, setExpanded] = useState(false);

  const hidden = thread.replies.length - REPLIES_SHOWN_COLLAPSED;
  // Oldest first, so the one left visible is where the conversation starts.
  const visible = expanded ? thread.replies : thread.replies.slice(0, REPLIES_SHOWN_COLLAPSED);

  const isOwn = (note: ThreadedNote) =>
    currentUserId !== null && note.author_user_id === currentUserId;

  return (
    <li className="flex flex-col gap-1.5">
      <NoteBody
        note={thread}
        isOwn={isOwn(thread)}
        onReply={() => setReplyTo(thread)}
        onChanged={onChanged}
      />

      {(visible.length > 0 || replyTo) && (
        // One rule down the left, and only one, however deep the conversation
        // actually goes. Indenting per level inside a card that already carries
        // twenty champion portraits is unreadable by the third reply on a
        // phone; a deeper answer names its target instead (see `replyingTo`).
        <div className="ml-3 flex flex-col gap-1.5 border-l-2 border-border pl-3 sm:ml-4">
          {visible.map((reply) => (
            <NoteBody
              key={reply.id}
              note={reply}
              isOwn={isOwn(reply)}
              isReply
              onReply={() => {
                setReplyTo(reply);
                // The composer sits at the bottom of the thread, so answering a
                // hidden reply has to reveal what's between them.
                setExpanded(true);
              }}
              onChanged={onChanged}
            />
          ))}

          {hidden > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((open) => !open)}
              className="self-start text-grey-mid hover:text-gold-bright"
            >
              <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
              {expanded
                ? "Show fewer replies"
                : `Show ${hidden} more ${hidden === 1 ? "reply" : "replies"}`}
            </Button>
          )}

          {replyTo && (
            <div className="flex flex-col gap-1.5">
              {/* The composer stays at the bottom rather than moving under
                  whichever note was clicked — replies append chronologically,
                  so writing where the next one will appear is the honest
                  position. This line is what keeps the target unambiguous. */}
              <p className="flex items-center gap-1 text-[11px] text-grey-mid">
                <Reply className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  replying to{" "}
                  <span className="text-grey-light">
                    {replyTo.authorLabel ?? (replyTo.id === thread.id ? "this note" : "a reply")}
                  </span>
                </span>
              </p>
              <NoteComposer
                // Remounts when the target changes, so switching who you're
                // answering doesn't carry a half-typed reply across.
                key={replyTo.id}
                placeholder="Reply…"
                submitLabel="Reply"
                autoFocus
                onCancel={() => setReplyTo(null)}
                onSubmit={async (text) => {
                  const result = await addScrimGameNote(gameId, text, replyTo.id);
                  if (result.error) {
                    toast.error(result.error);
                    return false;
                  }
                  setReplyTo(null);
                  // A new reply is the newest, so it lands under the collapse —
                  // open the thread so whoever wrote it can see it.
                  setExpanded(true);
                  onChanged();
                  return true;
                }}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function ScrimGameNotes({
  gameId,
  threads,
  currentUserId,
}: {
  gameId: string;
  /** Newest first, replies attached and authors resolved — see threadNotes. */
  threads: ScrimNoteThread[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const refresh = () => router.refresh();

  return (
    <section className="flex flex-col gap-2 border-t border-border pt-2">
      {threads.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {threads.map((thread) => (
            <NoteThread
              key={thread.id}
              thread={thread}
              gameId={gameId}
              currentUserId={currentUserId}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}

      {/* The composer is collapsed by default. The history page renders every
          game ever played, so an always-open textarea per card would be a
          column of empty boxes taller than the drafts they belong to. */}
      {composing ? (
        <NoteComposer
          placeholder="What to remember about this game — their draft, a call that cost us, something to try next time."
          submitLabel="Add note"
          autoFocus
          onCancel={() => setComposing(false)}
          onSubmit={async (text) => {
            const result = await addScrimGameNote(gameId, text);
            if (result.error) {
              toast.error(result.error);
              return false;
            }
            setComposing(false);
            refresh();
            return true;
          }}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setComposing(true)}
          className="self-start text-grey-mid hover:text-gold-bright"
        >
          {threads.length === 0 ? <MessageSquarePlus /> : <CornerDownRight />}
          {threads.length === 0 ? "Add a note" : "Add another note"}
        </Button>
      )}
    </section>
  );
}
