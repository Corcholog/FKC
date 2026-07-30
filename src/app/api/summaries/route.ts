import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadAiContext } from "@/lib/ai-context";
import { generatePlayerSummary, generateTeamSummary } from "@/lib/summary";
import { describeGeminiError, geminiLimiter } from "@/lib/gemini";

// Several Gemini calls in one invocation, paced by the shared limiter. Same
// ceiling as /api/sync — Hobby caps at 60s regardless, so the budget below
// stops the run cleanly rather than being killed mid-write.
export const maxDuration = 60;

const BUDGET_MS = 50_000;
// A generation takes a few seconds; the limiter's spacing is the bigger term.
// A call that hits 503s and burns its retries can exceed this — that's fine,
// the run just ends partial and the stale flags survive for the next one.
const CALL_BUDGET_MS = 8_000;

// Gemini's free tier meters requests per day, so this endpoint is the whole
// AI budget: one call per player with new data, plus one for the team. It
// replaced regenerate-on-page-view, which scaled with browsing rather than
// with how much actually changed.
async function handle(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Service role: the cron has no user session, and this writes summaries for
  // every player rather than just the caller's own.
  const admin = createAdminClient();
  const endsAt = Date.now() + BUDGET_MS;
  const hasRoom = () => Date.now() + geminiLimiter.peekWaitMs() + CALL_BUDGET_MS < endsAt;

  // Loaded once and handed to every generation — otherwise each summary would
  // re-read the clan blurb and the whole roster's context.
  const aiContext = await loadAiContext(admin);

  const result = { team: false, players: 0, skipped: 0, partial: false };

  try {
    // Team summary first: it's the one on the dashboard that everyone sees, and
    // if the budget runs out an individual player's page still has yesterday's.
    if (hasRoom()) {
      const team = await generateTeamSummary(admin, aiContext);
      result.team = !("notEnoughData" in team);
    } else {
      result.partial = true;
    }

    // Only players whose data actually moved. Oldest first, so a run that gets
    // cut short doesn't keep refreshing the same few and starving the rest.
    const { data: stale } = await admin
      .from("player_ai_summaries")
      .select("player_id, generated_at")
      .eq("stale", true)
      .order("generated_at", { ascending: true, nullsFirst: true });

    for (const row of stale ?? []) {
      if (!hasRoom()) {
        result.partial = true;
        result.skipped += 1;
        continue;
      }

      const summary = await generatePlayerSummary(admin, row.player_id as string, aiContext);
      if ("notEnoughData" in summary) {
        // Nothing to say yet, but leaving it stale means retrying it every run
        // forever — clear the flag and let the next sync set it again.
        await admin
          .from("player_ai_summaries")
          .update({ stale: false })
          .eq("player_id", row.player_id);
        result.skipped += 1;
      } else {
        result.players += 1;
      }
    }

    return NextResponse.json({ status: "success", ...result });
  } catch (e) {
    // Partial work is kept: whatever was written before the failure stays, and
    // anything still stale is picked up by the next run.
    return NextResponse.json(
      { status: "error", error: describeGeminiError(e), ...result },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
