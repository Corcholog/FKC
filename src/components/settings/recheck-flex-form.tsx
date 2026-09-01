"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { recheckFlexGamesAction } from "@/app/(app)/settings/actions/sync";
import { emptyPlayerFormState } from "@/app/(app)/settings/form-state";
import { Button } from "@/components/ui/button";

// Sibling of the other two maintenance forms on this page, and shaped the same.
export function RecheckFlexForm() {
  const [formState, formAction, pending] = useActionState(
    recheckFlexGamesAction,
    emptyPlayerFormState,
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-grey-light">
        A flex game counts only when five of the roster were on one side, and that judgement is
        made once — the first time the game is seen. Link a new account for somebody, or change
        the roster, and games they were really in stay skipped, because the app could not tell it
        was them at the time.
      </p>
      <p className="text-xs text-grey-mid">
        This clears those skip markers so the next sync looks at them again. It makes no Riot calls
        itself — press <span className="text-grey-light">Sync</span> afterwards, more than once if
        there is a lot of history. Games already counted are left alone, so no notes or scores are
        lost.
      </p>

      <form action={formAction}>
        <Button type="submit" disabled={pending} size="sm" variant="outline">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Clearing…" : "Re-check skipped flex games"}
        </Button>
      </form>

      {formState?.error && <p className="text-sm text-loss">{formState.error}</p>}
      {formState?.success && formState.message && (
        <p className="text-sm text-win">{formState.message}</p>
      )}
    </div>
  );
}
