"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  last_solo_sync_at: string | null;
  last_flex_sync_at: string | null;
};

/**
 * Per-queue sync controls.
 *
 * The navbar's Sync button covers both queues, which is what you want nine
 * times out of ten. This is the tenth: a flex backfill reaching to June takes
 * several runs, and spending each of them re-walking soloQ as well is time the
 * 60-second budget does not have.
 *
 * It sits next to the per-queue timestamps deliberately — "when was flex last
 * synced" and "sync flex now" are the same thought.
 */
function QueueSyncButtons() {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);

  async function run(queues: string, label: string) {
    setRunning(queues);
    try {
      const res = await fetch(`/api/sync?queues=${queues}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? `${label} sync failed.`);
      } else {
        const found = data.newMatches ?? 0;
        const result = `${label}: ${found} new match(es).`;
        // A partial run is not a failure — the cursors only advanced as far as
        // this run actually proved, so the next one resumes. Saying so is what
        // stops a multi-run backfill looking stuck.
        if (data.partial) {
          toast.warning(`${result} Hit the rate limit — run it again to continue.`);
        } else {
          toast.success(result);
        }
      }
      router.refresh();
    } catch {
      toast.error(`${label} sync failed — network error.`);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex items-center gap-2 pt-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={running !== null}
        onClick={() => run("solo", "SoloQ")}
      >
        {running === "solo" ? "Syncing…" : "Sync SoloQ"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={running !== null}
        onClick={() => run("flex", "FlexQ")}
      >
        {running === "flex" ? "Syncing…" : "Sync FlexQ"}
      </Button>
    </div>
  );
}

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
  soloSyncAgo,
  flexSyncAgo,
}: {
  state: SyncState;
  /** Formatted server-side. Null when there has never been a sync. */
  lastSyncAgo: string | null;
  /** Per queue, same treatment. Null until that queue has completed a run. */
  soloSyncAgo: string | null;
  flexSyncAgo: string | null;
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

      {/* Split out because one timestamp stops answering the question once the
          button can be aimed at one queue: a week of soloQ-only syncs leaves
          "last sync" looking fresh while flex quietly falls behind. Only a run
          that finished a queue stamps it, so "2 days ago" here means covered,
          not attempted. */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-grey-light">SoloQ covered</span>
        <span className="text-white">{soloSyncAgo ?? "Not yet"}</span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-grey-light">FlexQ covered</span>
        <span className="text-white">{flexSyncAgo ?? "Not yet"}</span>
      </div>

      <QueueSyncButtons />

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
