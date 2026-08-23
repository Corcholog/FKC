"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { updateClanContext } from "@/app/(app)/settings/actions";
import { emptyPlayerFormState } from "@/app/(app)/settings/form-state";
import { MAX_CLAN_CONTEXT_CHARS } from "@/lib/ai-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ClanContextForm({
  initialContext,
  lastGeneratedAgo,
}: {
  initialContext: string | null;
  /**
   * Formatted server-side, not an ISO string, so this component never reads the
   * clock during render — see the header of SyncStatusSection for the hydration
   * mismatch that caused. Null when the team summary has never been generated.
   */
  lastGeneratedAgo: string | null;
}) {
  const router = useRouter();
  const [saveState, saveAction, saving] = useActionState(updateClanContext, emptyPlayerFormState);

  // Posts to /api/summaries rather than using a server action: this is the same
  // batch the daily cron runs, and it needs that route's maxDuration and time
  // budget. A roster's worth of Gemini calls does not fit in the default
  // server-action timeout.
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  async function handleRegenerate() {
    setRunning(true);
    setRunError(null);
    setRunMessage(null);

    try {
      const res = await fetch("/api/summaries", { method: "POST" });
      const data = await res.json();

      // A partial run still wrote something, so the counts are reported either
      // way rather than being swallowed by the error.
      const wrote = `${data.team ? "team recap" : "no team recap"}, ${data.players ?? 0} player summar${
        data.players === 1 ? "y" : "ies"
      }`;

      if (!res.ok) {
        setRunError(`${data.error ?? "Failed to generate summaries."} (wrote ${wrote})`);
      } else if (data.partial) {
        setRunMessage(`Wrote ${wrote}, then ran out of time. Run it again to finish the rest.`);
      } else {
        setRunMessage(`Done — ${wrote}.`);
      }
      router.refresh();
    } catch {
      setRunError("Couldn't reach the server.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={saveAction} className="flex flex-col gap-2">
        <Label htmlFor="context" className="text-xs text-grey-light">
          Everything the AI should know about the group
        </Label>
        <Textarea
          id="context"
          name="context"
          rows={8}
          maxLength={MAX_CLAN_CONTEXT_CHARS}
          defaultValue={initialContext ?? ""}
          placeholder={
            "Inside jokes, slang, nicknames, running bits — anything that makes the summaries sound like they came from someone actually in the Discord.\n\nPlain prose works best. For example: \"We call the jungle 'la selva'. Nobody has forgiven Fede for the Baron thing. Every loss is the support's fault by default.\""
          }
          className="min-h-40"
        />
        <p className="text-xs text-grey-mid">
          Goes into every summary prompt, the team one and each player&apos;s. Up to{" "}
          {MAX_CLAN_CONTEXT_CHARS.toLocaleString("en-US")} characters — past that it starts crowding
          out the actual match data.
        </p>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={saving} size="sm">
            {saving ? "Saving…" : "Save context"}
          </Button>
          {saveState?.error && <p className="text-sm text-loss">{saveState.error}</p>}
          {saveState?.success && <p className="text-sm text-win">{saveState.message}</p>}
        </div>
      </form>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-sm text-grey-light">
          Summaries regenerate automatically once a day. Use this to see the effect of a context
          change straight away instead of waiting.
        </p>
        <p className="text-xs text-grey-mid">
          {lastGeneratedAgo
            ? `Team summary last generated ${lastGeneratedAgo}.`
            : "The team summary hasn't been generated yet."}{" "}
          Each run spends Gemini free-tier quota, which is capped per day and resets at midnight
          Pacific.
        </p>

        <Button
          type="button"
          onClick={handleRegenerate}
          disabled={running}
          size="sm"
          variant="outline"
          className="self-start"
        >
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {running ? "Generating…" : "Regenerate summaries now"}
        </Button>

        {runError && <p className="text-sm text-loss">{runError}</p>}
        {runMessage && <p className="text-sm text-win">{runMessage}</p>}
      </div>
    </div>
  );
}
