"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/format";

export function AiSummaryCard({
  playerId,
  initialSummary,
  initialGeneratedAt,
  isStale,
}: {
  playerId: string;
  initialSummary: string | null;
  initialGeneratedAt: string | null;
  isStale: boolean;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [loading, setLoading] = useState(isStale);
  const [error, setError] = useState<string | null>(null);
  const [notEnoughData, setNotEnoughData] = useState(false);

  useEffect(() => {
    if (!isStale) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "Failed to generate summary.");
        } else if (data.notEnoughData) {
          setNotEnoughData(true);
        } else {
          setSummary(data.summaryText);
          setGeneratedAt(data.generatedAt);
        }
      } catch {
        if (!cancelled) setError("Failed to generate summary — network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, isStale]);

  if (!isStale && !summary) return null;

  return (
    <div className="rounded-lg border-l-4 border-l-blue-primary bg-bg-tertiary p-4">
      <p className="mb-1.5 text-xs font-medium tracking-wide text-grey-light uppercase">AI Summary</p>

      {loading ? (
        <p className="text-sm text-grey-light">Generating summary…</p>
      ) : error ? (
        <p className="text-sm text-loss">{error}</p>
      ) : notEnoughData ? (
        <p className="text-sm text-grey-light">
          Not enough data yet — once matches are synced or notes are added, a summary will appear here.
        </p>
      ) : (
        <>
          <p className="text-sm whitespace-pre-wrap text-white">{summary}</p>
          {generatedAt && (
            <p className="mt-2 text-xs text-grey-mid">
              Generated {formatRelativeTime(generatedAt)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
