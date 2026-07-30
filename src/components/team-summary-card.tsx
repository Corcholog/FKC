import { Sparkles } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The roster-wide recap, written once a day by /api/summaries. Purely a
// read here — nothing on this page triggers generation, because Gemini's free
// tier is metered per day and a dashboard everyone opens is the worst possible
// place to spend that from.
export function TeamSummaryCard({
  summary,
  generatedAt,
}: {
  summary: string | null;
  generatedAt: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading flex items-center gap-1.5 text-xs tracking-wide text-grey-light uppercase">
          <Sparkles className="h-3.5 w-3.5 text-gold" />
          Clan recap
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {summary ? (
          <p className="text-sm whitespace-pre-wrap text-white">{summary}</p>
        ) : (
          <p className="text-sm text-grey-mid">
            Nothing yet — the recap is written once a day, after the sync.
          </p>
        )}

        {generatedAt && (
          <p className="text-xs text-grey-mid">Written {formatRelativeTime(generatedAt)}</p>
        )}
      </CardContent>
    </Card>
  );
}
