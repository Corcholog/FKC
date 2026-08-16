import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { describeGeminiError, geminiLimiter } from "@/lib/gemini";
import { generateAnalystSummary, DEMO_SUMMARY_DRAFT_SOURCE } from "@/lib/summary-analyst";
import type { AliasMap } from "@/lib/summary";

// One Gemini call per aliased player, paced by the shared limiter. Same 60s
// ceiling and the same budget shape as /api/summaries, for the same reason:
// Hobby kills the invocation at 60s regardless, so the run should end cleanly
// and report what it wrote rather than be cut mid-write.
export const maxDuration = 60;

const BUDGET_MS = 50_000;

// A first guess at how long one player takes, replaced by measurement below.
//
// It was a fixed 8s, which was wrong in the direction that matters: a real call
// here runs closer to 15s (a ~10k-character prompt, plus reading the player's
// whole history first), so the loop kept starting a fourth generation with 9
// seconds left and got killed part-way through it. The run then reported three
// written and the fourth's work was simply lost.
const INITIAL_CALL_ESTIMATE_MS = 15_000;

// Deliberately not on the cron, unlike /api/summaries.
//
// These are published on a page with no login in front of it, and the whole
// point of Phase 5 is that a person reads them before that happens. A nightly
// job that rewrites public prose unattended is the exact thing this endpoint
// exists to avoid — so it is a button in Settings, it is signed-in only, and
// what it writes is a draft in demo_text that the same page then shows for
// editing.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Both optional. `playerId` regenerates exactly one; `regenerate` rewrites
  // everyone. With neither, the run fills in whatever is still missing — which
  // is what makes pressing the button twice finish the job instead of redoing
  // the first few players until the clock runs out.
  const body = await request.json().catch(() => ({}));
  const onlyPlayerId = typeof body?.playerId === "string" ? body.playerId : null;
  const regenerateAll = body?.regenerate === true;

  // Service role: demo_aliases and demo_text are both authenticated-only, and
  // this reads every player's history rather than the caller's own.
  const admin = createAdminClient();
  const endsAt = Date.now() + BUDGET_MS;
  let callEstimateMs = INITIAL_CALL_ESTIMATE_MS;
  const hasRoom = () => Date.now() + geminiLimiter.peekWaitMs() + callEstimateMs < endsAt;

  const result = { written: 0, skipped: 0, partial: false, remaining: 0 };

  try {
    const [{ data: aliasRows, error }, { data: existingRows }] = await Promise.all([
      admin.from("demo_aliases").select("player_id, alias").order("alias"),
      admin.from("demo_text").select("row_id, body").eq("source", DEMO_SUMMARY_DRAFT_SOURCE),
    ]);
    if (error) throw new Error(error.message);

    // The map covers the whole roster, not just the player being written about:
    // a teammate named inside a game line resolves through it too. Always the
    // full map, even when regenerating one player.
    const aliases: AliasMap = new Map(
      (aliasRows ?? []).map((r) => [r.player_id as string, r.alias as string]),
    );

    // "Missing" means missing a *draft*, not missing from the demo: this run
    // writes drafts, so what it should skip is a player who already has one to
    // read. An emptied-out draft counts as missing and gets rewritten.
    const written = new Set(
      (existingRows ?? [])
        .filter((r) => ((r.body as string) ?? "").trim().length > 0)
        .map((r) => r.row_id as string),
    );

    let queue = [...aliases.keys()];
    if (onlyPlayerId) queue = queue.filter((id) => id === onlyPlayerId);
    else if (!regenerateAll) queue = queue.filter((id) => !written.has(id));

    result.remaining = queue.length;

    for (const playerId of queue) {
      if (!hasRoom()) {
        result.partial = true;
        result.skipped += 1;
        continue;
      }

      const startedAt = Date.now();
      const summaryText = await generateAnalystSummary(admin, playerId, aliases);
      // Measured, so the next iteration's room check reflects how long this
      // roster and this prompt actually take rather than a guess made once.
      callEstimateMs = Math.max(callEstimateMs, Date.now() - startedAt);

      if (summaryText === null) {
        // No history to read. Nothing to write and nothing to fix.
        result.skipped += 1;
        result.remaining -= 1;
        continue;
      }

      // The draft row only. Nothing here touches what the demo is serving —
      // that stays whatever was last published, including "nothing".
      const { error: writeError } = await admin.from("demo_text").upsert(
        {
          source: DEMO_SUMMARY_DRAFT_SOURCE,
          row_id: playerId,
          body: summaryText,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source,row_id" },
      );
      if (writeError) throw new Error(`Writing ${aliases.get(playerId) ?? playerId}: ${writeError.message}`);

      result.written += 1;
      result.remaining -= 1;
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
