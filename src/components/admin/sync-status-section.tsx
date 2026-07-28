"use client";

import { useActionState, useRef } from "react";
import { updateRiotKey } from "@/app/(app)/admin/actions";
import { emptyPlayerFormState, type PlayerFormState } from "@/app/(app)/admin/form-state";
import { formatRelativeTime } from "@/lib/format";

type SyncState = {
  riot_key_valid: boolean;
  last_sync_status: string | null;
  last_sync_finished_at: string | null;
  last_error: string | null;
};

export function SyncStatusSection({ state }: { state: SyncState }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [formState, formAction, pending] = useActionState(async (prevState: PlayerFormState, formData: FormData) => {
    const result = await updateRiotKey(prevState, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, emptyPlayerFormState);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-secondary p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-grey-light">Riot API key status</span>
        <span className={state.riot_key_valid ? "text-win" : "text-warning"}>
          {state.riot_key_valid ? "Valid" : "Invalid / expired"}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-grey-light">Last sync</span>
        <span className="text-white">
          {state.last_sync_finished_at
            ? `${state.last_sync_status ?? "unknown"} · ${formatRelativeTime(state.last_sync_finished_at)}`
            : "Never synced yet"}
        </span>
      </div>

      {state.last_sync_status === "error" && state.last_error && (
        <p className="text-xs text-loss">{state.last_error}</p>
      )}

      <form ref={formRef} action={formAction} className="flex items-end gap-2 pt-1">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="riotApiKey" className="text-xs text-grey-light">
            Update Riot API key
          </label>
          <input
            id="riotApiKey"
            name="riotApiKey"
            type="password"
            placeholder="RGAPI-..."
            autoComplete="off"
            required
            className="rounded-md border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-white outline-none focus:border-blue-primary"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-bright disabled:opacity-50"
        >
          {pending ? "Saving…" : "Update"}
        </button>
      </form>
      {formState?.error && <p className="text-sm text-loss">{formState.error}</p>}
      {formState?.success && <p className="text-sm text-win">Key updated.</p>}
    </div>
  );
}
