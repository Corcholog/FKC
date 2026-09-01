"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { refetchMatchDetailsAction } from "@/app/(app)/settings/actions/sync";
import { emptyPlayerFormState } from "@/app/(app)/settings/form-state";
import { Button } from "@/components/ui/button";

export function RefetchDetailsForm() {
  const [formState, formAction, pending] = useActionState(
    refetchMatchDetailsAction,
    emptyPlayerFormState,
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-grey-light">
        Matches synced before the extra stats (vision, objectives, multikills, pings, time spent
        dead) were captured only hold the basics. Riot keeps match detail around indefinitely, so
        this reads them again and fills in the rest.
      </p>
      <p className="text-xs text-grey-mid">
        Riot&apos;s rate limit caps this at roughly 40 matches per run. If there are more, the
        button reports how many are left — press it again to continue where it stopped.
      </p>

      <form action={formAction}>
        <Button type="submit" disabled={pending} size="sm" variant="outline">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Re-fetching…" : "Re-fetch match details"}
        </Button>
      </form>

      {formState?.error && <p className="text-sm text-loss">{formState.error}</p>}
      {formState?.success && formState.message && (
        <p className="text-sm text-win">{formState.message}</p>
      )}
    </div>
  );
}
