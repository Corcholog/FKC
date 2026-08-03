import { formatRelativeTime } from "@/lib/format";
import { MIN_NEW_GAMES } from "@/lib/summary";

// Read-only. This used to POST /api/summary on mount whenever the summary was
// stale, which meant Gemini cost scaled with how much anyone happened to
// browse — every sync marks every touched player stale, so a handful of page
// views after a sync could burn through a free tier that's capped per day.
//
// Generation now happens in /api/summaries, alongside the team recap. A stale
// summary shows the previous text rather than a spinner: it's a few hours old,
// not wrong, and saying nothing would be worse.
export function AiSummaryCard({
  summary,
  generatedAt,
  isStale,
  newGames,
}: {
  summary: string | null;
  generatedAt: string | null;
  isStale: boolean;
  /** Games recorded since this text was written, for the staleness hint. */
  newGames: number;
}) {
  if (!summary) {
    return (
      <div className="border-l-4 border-l-gold bg-bg-secondary p-4 shadow-[0_2px_10px_-6px_rgba(0,0,0,0.7)]">
        <p className="mb-1.5 text-xs font-medium tracking-wide text-grey-light uppercase">
          AI Summary
        </p>
        <p className="text-sm text-grey-light">
          Nothing yet — summaries are written once a day, after the sync.
        </p>
      </div>
    );
  }

  return (
    <div className="border-l-4 border-l-gold bg-bg-secondary p-4 shadow-[0_2px_10px_-6px_rgba(0,0,0,0.7)]">
      <p className="mb-1.5 text-xs font-medium tracking-wide text-grey-light uppercase">
        AI Summary
      </p>
      <p className="text-sm whitespace-pre-wrap text-white">{summary}</p>

      {generatedAt && (
        <p className="mt-2 text-xs text-grey-mid">
          Generated {formatRelativeTime(generatedAt)}
          {/* The old copy promised "refreshes on the next daily run", which the
              new-games threshold made untrue: two games after a summary, the
              next run deliberately skips this player. Saying how many games are
              banked and how many it takes is the honest version, and it's the
              number the batch actually tests. */}
          {isStale &&
            newGames > 0 &&
            (newGames >= MIN_NEW_GAMES
              ? ` · ${newGames} new games since — refreshes on the next daily run`
              : ` · ${newGames} new game${newGames === 1 ? "" : "s"} since — refreshes at ${MIN_NEW_GAMES}`)}
        </p>
      )}
    </div>
  );
}
