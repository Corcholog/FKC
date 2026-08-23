"use client";

import { useActionState, useRef } from "react";
import { updateRiotKey } from "@/app/(app)/settings/actions";
import { emptyPlayerFormState, type PlayerFormState } from "@/app/(app)/settings/form-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SyncState = {
  riot_key_valid: boolean;
  last_sync_status: string | null;
  last_sync_finished_at: string | null;
  last_error: string | null;
};

/**
 * `lastSyncAgo` arrives already formatted, and that is the point.
 *
 * This is a client component, so its render runs twice: once on the server to
 * produce HTML, and again in the browser to hydrate it. `formatRelativeTime`
 * reads `Date.now()`, so those two runs disagreed whenever enough wall-clock
 * time passed between them — the server had written "8 minutes ago" into the
 * HTML and hydration computed "19 minutes ago", which React reports as a
 * hydration mismatch (an error in dev, a silent client re-render in production).
 *
 * Nothing on this page reads the clock in the browser any more. The relative
 * time is computed once, on the server, at the same moment as the row it
 * describes — so the two renders cannot disagree, and there is no flash of a
 * placeholder either, which is what a mount-then-swap or `useSyncExternalStore`
 * fix would have cost.
 */
export function SyncStatusSection({
  state,
  lastSyncAgo,
}: {
  state: SyncState;
  /** Formatted server-side. Null when there has never been a sync. */
  lastSyncAgo: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [formState, formAction, pending] = useActionState(async (prevState: PlayerFormState, formData: FormData) => {
    const result = await updateRiotKey(prevState, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, emptyPlayerFormState);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-grey-light">Riot API key status</span>
        <Badge
          variant="outline"
          className={state.riot_key_valid ? "border-win/40 text-win" : "border-warning/40 text-warning"}
        >
          {state.riot_key_valid ? "Valid" : "Invalid / expired"}
        </Badge>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-grey-light">Last sync</span>
        <span className="text-white">
          {lastSyncAgo
            ? `${state.last_sync_status ?? "unknown"} · ${lastSyncAgo}`
            : "Never synced yet"}
        </span>
      </div>

      {state.last_sync_status === "error" && state.last_error && (
        <p className="text-xs text-loss">{state.last_error}</p>
      )}

      <form ref={formRef} action={formAction} className="flex items-end gap-2 pt-1">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="riotApiKey" className="text-xs text-grey-light">
            Update Riot API key
          </Label>
          <Input id="riotApiKey" name="riotApiKey" type="password" placeholder="RGAPI-..." autoComplete="off" required />
        </div>
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : "Update"}
        </Button>
      </form>
      {formState?.error && <p className="text-sm text-loss">{formState.error}</p>}
      {formState?.success && <p className="text-sm text-win">Key updated.</p>}
    </div>
  );
}
