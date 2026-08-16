"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { saveDemoSummary } from "@/app/(app)/settings/actions";
import { emptyPlayerFormState } from "@/app/(app)/settings/form-state";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type DemoSummaryDraft = {
  /** The real player id — demo_text is keyed on it; the alias is what's shown. */
  playerId: string;
  alias: string;
  body: string;
  updatedAt: string | null;
};

// The review step between generating a demo summary and publishing it.
//
// Generation posts to /api/demo-summaries, which writes drafts for the whole
// roster in one invocation — a server action can't hold nine Gemini calls
// inside its timeout, the same reason the clan recap button posts to a route.
// Saving is per player, because approving is per player: a batch where one
// bullet is wrong should not be all-or-nothing.
function SummaryRow({ draft }: { draft: DemoSummaryDraft }) {
  const [state, action, saving] = useActionState(saveDemoSummary, emptyPlayerFormState);
  const [body, setBody] = useState(draft.body);

  return (
    <form action={action} className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <input type="hidden" name="playerId" value={draft.playerId} />

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium text-white">{draft.alias}</span>
        {draft.updatedAt ? (
          <span className="text-xs text-grey-mid">
            written {formatRelativeTime(draft.updatedAt)}
          </span>
        ) : (
          <span className="text-xs text-grey-mid">nothing yet</span>
        )}
        {/* Says what is true of the demo right now, not what is in the box —
            an unsaved edit has not changed the public page. */}
        <span
          className={`ml-auto text-xs ${draft.body.trim() ? "text-win" : "text-grey-mid"}`}
        >
          {draft.body.trim() ? "live on the demo" : "hidden"}
        </span>
      </div>

      <Textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="Nothing generated yet. Generate drafts above, or write this one by hand."
        aria-label={`Demo summary for ${draft.alias}`}
        className="text-sm"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={saving || body === draft.body}>
          {saving && <Loader2 className="animate-spin" />}
          {body.trim() ? "Publish" : "Clear"}
        </Button>
        {state.error && <span className="text-xs text-loss">{state.error}</span>}
        {state.success && <span className="text-xs text-win">{state.message}</span>}
      </div>
    </form>
  );
}

export function DemoSummariesForm({ drafts }: { drafts: DemoSummaryDraft[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function generate() {
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/demo-summaries", { method: "POST" });
      const data = await res.json();
      const wrote = `${data.written ?? 0} draft${data.written === 1 ? "" : "s"}`;

      if (!res.ok) setError(`${data.error ?? "Failed to generate."} (wrote ${wrote})`);
      else if (data.partial) setMessage(`Wrote ${wrote}, then ran out of time. Run it again.`);
      else setMessage(`Wrote ${wrote}. Read them before publishing.`);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setRunning(false);
    }
  }

  if (drafts.length === 0) {
    return (
      <p className="text-sm text-grey-mid">
        No demo aliases assigned yet — these are keyed off demo_aliases.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-grey-light">
          Scouting bullets for the public demo, written from the same data as the private
          summaries but with aliases, no match notes and no clan context. Generating writes
          drafts; nothing reaches <span className="text-white">/demo</span> until you publish it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={generate} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {running ? "Generating…" : "Generate drafts"}
          </Button>
          {error && <span className="text-xs text-loss">{error}</span>}
          {message && <span className="text-xs text-win">{message}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {drafts.map((draft) => (
          <SummaryRow key={draft.playerId} draft={draft} />
        ))}
      </div>
    </div>
  );
}
