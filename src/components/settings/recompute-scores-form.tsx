"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { recomputeScoresAction } from "@/app/(app)/settings/actions/sync";
import { emptyPlayerFormState } from "@/app/(app)/settings/form-state";
import { Button } from "@/components/ui/button";

// Sibling of RefetchDetailsForm, and deliberately shaped the same: the two
// buttons sit together, do the same kind of thing to the same table, and want
// to be pressed the same way.
export function RecomputeScoresForm() {
  const [formState, formAction, pending] = useActionState(
    recomputeScoresAction,
    emptyPlayerFormState,
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-grey-light">
        The performance score is worked out from the ten participants of a match at once, so it is
        computed when a match is synced rather than every time a page is opened. This fills it in
        for matches that were already stored.
      </p>
      <p className="text-xs text-grey-mid">
        Uses no Riot API calls, so it works with an expired key. Matches still missing the extra
        stats are skipped — run <span className="text-grey-light">Re-fetch match details</span>{" "}
        first and they will be picked up here afterwards.
      </p>

      <form action={formAction}>
        <Button type="submit" disabled={pending} size="sm" variant="outline">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Scoring…" : "Recompute scores"}
        </Button>
      </form>

      {formState?.error && <p className="text-sm text-loss">{formState.error}</p>}
      {formState?.success && formState.message && (
        <p className="text-sm text-win">{formState.message}</p>
      )}
    </div>
  );
}
