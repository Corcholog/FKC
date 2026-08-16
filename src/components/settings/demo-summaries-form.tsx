"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { saveDemoSummary } from "@/app/(app)/settings/actions";
import { emptyPlayerFormState } from "@/app/(app)/settings/form-state";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type DemoSummaryDraft = {
  /** The real player id — demo_text is keyed on it; the alias is what's shown. */
  playerId: string;
  alias: string;
  /** The working copy: the draft row, or the published text if there is no draft. */
  body: string;
  updatedAt: string | null;
  /** What /demo is actually serving right now. Empty means no card there. */
  publishedBody: string;
};

type RunResult = { error?: string; message?: string };

/**
 * Posts to /api/demo-summaries and turns the response into one sentence.
 *
 * A server action can't hold a roster's worth of Gemini calls inside its
 * timeout, the same reason the clan recap button posts to a route. The route
 * can't hold them either — about three fit in a 60s invocation — so the
 * interesting part of the reply is `remaining`, and the message has to say it.
 * Without that, a partial run reads as a failure and pressing the button again
 * looks like it did nothing.
 */
async function runGeneration(payload: Record<string, unknown>): Promise<RunResult> {
  try {
    const res = await fetch("/api/demo-summaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const wrote = `${data.written ?? 0} draft${data.written === 1 ? "" : "s"}`;

    if (!res.ok) return { error: `${data.error ?? "Failed to generate."} (wrote ${wrote})` };
    if (data.partial) {
      const left = data.remaining ?? 0;
      return {
        message: `Wrote ${wrote}. ${left} still to go — press it again (about three fit in each run).`,
      };
    }
    if ((data.written ?? 0) === 0) {
      return { message: "Nothing missing — every player already has a draft." };
    }
    return { message: `Wrote ${wrote}. Read them before publishing.` };
  } catch {
    return { error: "Could not reach the server." };
  }
}

function SummaryRow({
  draft,
  onRegenerate,
  busy,
}: {
  draft: DemoSummaryDraft;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const [state, action, saving] = useActionState(saveDemoSummary, emptyPlayerFormState);
  const [body, setBody] = useState(draft.body);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium text-white">{draft.alias}</span>
        {draft.updatedAt ? (
          <span className="text-xs text-grey-mid">
            written {formatRelativeTime(draft.updatedAt)}
          </span>
        ) : (
          <span className="text-xs text-grey-mid">nothing yet</span>
        )}
        {/* Reads publishedBody, never the box. The box is a draft — text can
            sit in it for as long as you like without /demo changing, and the
            whole point of the two rows behind this is that those are different
            states. */}
        <span
          className={`ml-auto text-xs ${
            draft.publishedBody.trim()
              ? body.trim() === draft.publishedBody.trim()
                ? "text-win"
                : "text-warning"
              : "text-grey-mid"
          }`}
        >
          {draft.publishedBody.trim()
            ? body.trim() === draft.publishedBody.trim()
              ? "live on the demo"
              : "live, but not this version"
            : "not on the demo"}
        </span>
      </div>

      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="playerId" value={draft.playerId} />
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
          {/* Enabled whenever the box differs from what is *live*, not from
              what was loaded — a freshly generated draft is unchanged text that
              still needs publishing. */}
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={saving || body.trim() === draft.publishedBody.trim()}
          >
            {saving && <Loader2 className="animate-spin" />}
            {body.trim() ? "Publish" : "Take down"}
          </Button>
          {/* Outside the form on purpose — it isn't a submit, and nesting it
              inside would make Enter in the textarea ambiguous. */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onRegenerate}
            disabled={busy}
            title={`Rewrite ${draft.alias}'s draft from scratch`}
          >
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Regenerate
          </Button>
          {state.error && <span className="text-xs text-loss">{state.error}</span>}
          {state.success && <span className="text-xs text-win">{state.message}</span>}
        </div>
      </form>
    </div>
  );
}

export function DemoSummariesForm({ drafts }: { drafts: DemoSummaryDraft[] }) {
  const router = useRouter();
  // Which player is being regenerated, or "all" for a batch run. One at a time:
  // two concurrent runs would race the same rate limiter and each would think
  // the other's waiting time was its own.
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult>({});

  const missing = drafts.filter((d) => !d.body.trim()).length;

  async function run(key: string, payload: Record<string, unknown>) {
    setBusy(key);
    setResult({});
    setResult(await runGeneration(payload));
    setBusy(null);
    router.refresh();
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
          drafts into a separate row; nothing reaches <span className="text-white">/demo</span>{" "}
          until you press Publish on it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => run("all", {})}
            disabled={busy !== null || missing === 0}
          >
            {busy === "all" ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy === "all"
              ? "Generating…"
              : missing === 0
                ? "All drafts written"
                : `Generate ${missing} missing`}
          </Button>
          {result.error && <span className="text-xs text-loss">{result.error}</span>}
          {result.message && <span className="text-xs text-win">{result.message}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {drafts.map((draft) => (
          <SummaryRow
            key={draft.playerId}
            draft={draft}
            busy={busy === draft.playerId}
            onRegenerate={() => run(draft.playerId, { playerId: draft.playerId })}
          />
        ))}
      </div>
    </div>
  );
}
