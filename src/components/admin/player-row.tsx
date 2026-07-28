"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { updatePlayer, deletePlayer } from "@/app/(app)/admin/actions";
import { emptyPlayerFormState, type PlayerFormState } from "@/app/(app)/admin/form-state";

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
    if (!confirm(`Remove ${player.display_name}? This also deletes their notes and AI summary.`)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePlayer(player.id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to remove player.");
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-border bg-bg-secondary p-4">
        <form
          action={formAction}
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <input type="hidden" name="id" value={player.id} />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-grey-light">Game name</label>
            <input
              name="gameName"
              defaultValue={player.riot_game_name}
              required
              className="rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-white outline-none focus:border-blue-primary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-grey-light">Tag line</label>
            <input
              name="tagLine"
              defaultValue={player.riot_tag_line}
              required
              className="w-24 rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-white outline-none focus:border-blue-primary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-grey-light">Display name</label>
            <input
              name="displayName"
              defaultValue={player.display_name}
              required
              className="rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-white outline-none focus:border-blue-primary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-grey-light">New avatar</label>
            <input
              name="avatar"
              type="file"
              accept="image/*"
              className="text-xs text-grey-light file:mr-2 file:rounded file:border-0 file:bg-blue-muted file:px-2 file:py-1 file:text-white"
            />
          </div>

          {player.avatar_url && (
            <label className="flex items-center gap-1.5 text-xs text-grey-light">
              <input type="checkbox" name="removeAvatar" />
              Remove avatar
            </label>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-blue-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-bright disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-border px-4 py-1.5 text-sm text-grey-light transition-colors hover:text-white"
            >
              Cancel
            </button>
          </div>

          {state?.error && <p className="w-full text-sm text-loss">{state.error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-bg-secondary p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {player.avatar_url ? (
            <Image
              src={player.avatar_url}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="h-9 w-9 shrink-0 rounded-full bg-blue-muted" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{player.display_name}</p>
            <p className="truncate text-xs text-grey-light">
              {player.riot_game_name}#{player.riot_tag_line}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {deleteError && <p className="text-xs text-loss">{deleteError}</p>}
          <button
            type="button"
            onClick={() => {
              setResultMessage(null);
              setEditing(true);
            }}
            className="text-sm text-grey-light transition-colors hover:text-white"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm text-loss transition-colors hover:text-white disabled:opacity-50"
          >
            {deleting ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>

      {resultMessage && <p className="text-xs text-grey-light">{resultMessage}</p>}
    </li>
  );
}
