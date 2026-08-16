import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { describeGeminiError, geminiLimiter } from "@/lib/gemini";
import { generateAnalystSummary, DEMO_SUMMARY_SOURCE } from "@/lib/summary-analyst";
import type { AliasMap } from "@/lib/summary";

// One Gemini call per aliased player, paced by the shared limiter. Same 60s
// ceiling and the same budget shape as /api/summaries, for the same reason:
// Hobby kills the invocation at 60s regardless, so the run should end cleanly
// and report what it wrote rather than be cut mid-write.
export const maxDuration = 60;

const BUDGET_MS = 50_000;
const CALL_BUDGET_MS = 8_000;

// Deliberately not on the cron, unlike /api/summaries.
//
// These are published on a page with no login in front of it, and the whole
// point of Phase 5 is that a person reads them before that happens. A nightly
// job that rewrites public prose unattended is the exact thing this endpoint
// exists to avoid — so it is a button in Settings, it is signed-in only, and
// what it writes is a draft in demo_text that the same page then shows for
// editing.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Service role: demo_aliases and demo_text are both authenticated-only, and
  // this reads every player's history rather than the caller's own.
  const admin = createAdminClient();
  const endsAt = Date.now() + BUDGET_MS;
  const hasRoom = () => Date.now() + geminiLimiter.peekWaitMs() + CALL_BUDGET_MS < endsAt;

  const result = { written: 0, skipped: 0, partial: false };

  try {
    const { data: aliasRows, error } = await admin
      .from("demo_aliases")
      .select("player_id, alias")
      .order("alias");
    if (error) throw new Error(error.message);

    // The map covers the whole roster, not just the player being written about:
    // a teammate named inside a game line resolves through it too.
    const aliases: AliasMap = new Map(
      (aliasRows ?? []).map((r) => [r.player_id as string, r.alias as string]),
    );

    for (const [playerId, alias] of aliases) {
      if (!hasRoom()) {
        result.partial = true;
        result.skipped += 1;
        continue;
      }

      const summaryText = await generateAnalystSummary(admin, playerId, aliases);
      if (summaryText === null) {
        // No history to read. Nothing to write and nothing to fix.
        result.skipped += 1;
        continue;
      }

      const { error: writeError } = await admin.from("demo_text").upsert(
        {
          source: DEMO_SUMMARY_SOURCE,
          row_id: playerId,
          body: summaryText,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source,row_id" },
      );
      if (writeError) throw new Error(`Writing ${alias}: ${writeError.message}`);

      result.written += 1;
    }

    return NextResponse.json({ status: "success", ...result });
  } catch (e) {
    // Whatever was written before the failure stays — each player is its own
    // upsert, and a partial batch of drafts is still reviewable.
    return NextResponse.json(
      { status: "error", error: describeGeminiError(e), ...result },
      { status: 500 },
    );
  }
}
