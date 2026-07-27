"use client";

import { useActionState, useRef } from "react";
import { addPlayer } from "@/app/(app)/admin/actions";
import { emptyPlayerFormState, type PlayerFormState } from "@/app/(app)/admin/form-state";

export function AddPlayerForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prevState: PlayerFormState, formData: FormData) => {
    const result = await addPlayer(prevState, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, emptyPlayerFormState);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-border bg-bg-secondary p-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-grey-light" htmlFor="gameName">
          Game name
        </label>
        <input
          id="gameName"
          name="gameName"
          required
          className="rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-white outline-none focus:border-blue-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-grey-light" htmlFor="tagLine">
          Tag line
        </label>
        <input
          id="tagLine"
          name="tagLine"
          required
          placeholder="LAS"
          className="w-24 rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-white outline-none focus:border-blue-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-grey-light" htmlFor="displayName">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          required
          className="rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-white outline-none focus:border-blue-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-grey-light" htmlFor="avatar">
          Avatar
        </label>
        <input
          id="avatar"
          name="avatar"
          type="file"
          accept="image/*"
          className="text-xs text-grey-light file:mr-2 file:rounded file:border-0 file:bg-blue-muted file:px-2 file:py-1 file:text-white"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-bright disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add player"}
      </button>

      {state?.error && <p className="w-full text-sm text-loss">{state.error}</p>}
    </form>
  );
}
