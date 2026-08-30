import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SOLOQ_PARTICIPANTS } from "@/lib/data-source";
import { createClient } from "@/lib/supabase/server";
import { loadAiContext } from "@/lib/ai-context";
import {
  countRosterGamesSince,
  generatePlayerSummary,
  generateTeamSummary,
  MIN_NEW_GAMES,
} from "@/lib/summary";
import { describeGeminiError, geminiLimiter } from "@/lib/gemini";
import { postDailyStandings } from "@/lib/standings";

// Several Gemini calls in one invocation, paced by the shared limiter. Same
// ceiling as /api/sync — Hobby caps at 60s regardless, so the budget below
// stops the run cleanly rather than being killed mid-write.
export const maxDuration = 60;

const BUDGET_MS = 50_000;
// A generation takes a few seconds; the limiter's spacing is the bigger term.
// A call that hits 503s and burns its retries can exceed this — that's fine,
// the run just ends partial and the stale flags survive for the next one.
const CALL_BUDGET_MS = 8_000;

// This route is where MIN_NEW_GAMES (defined next to the prompt it pays for,
// in lib/summary.ts) is actually enforced. Counting the new games costs a
// Supabase count, which is free, to decide whether to spend a Gemini request,
// which is not.

// countRosterGamesSince moved to lib/summary.ts, beside the MIN_NEW_GAMES it is
// compared against: /settings now shows the same count next to the demo recap,
// and two copies of "how much has happened since" would be two thresholds.

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

  // belowThreshold and skipped are counted apart on purpose: "nothing changed
  // enough to be worth a request" and "we ran out of time" look identical in a
  // total, and the Settings button reports this to a person who needs to know
  // whether to run it again.
  const result = { team: false, players: 0, belowThreshold: 0, skipped: 0, partial: false };

  // Games recorded for a player since their summary was written. Counted rather
  // than fetched — head: true sends no rows back.
  //
  // Compares against game_creation, which is when Riot says the game started,
  // not when it was synced. A game played before the last generation but synced
  // after it therefore doesn't count towards the threshold. That undercount is
  // the right way round: it can only delay a rewrite, never trigger one for a
  // game the previous summary already described.
  const newGamesSince = async (playerId: string, since: string) => {
    const { count } = await admin
      .from(SOLOQ_PARTICIPANTS)
      .select("id, matches!inner(game_creation)", { count: "exact", head: true })
      .eq("player_id", playerId)
      .gt("matches.game_creation", since);
    return count ?? 0;
  };

  try {
    // Team summary first: it's the one on the dashboard that everyone sees, and
    // if the budget runs out an individual player's page still has yesterday's.
    const { data: teamRow } = await admin
      .from("team_ai_summary")
      .select("generated_at, stale, force_regenerate")
      .eq("id", 1)
      .maybeSingle();

    if (teamRow?.stale !== false) {
      // Any tracked player's game changes the group picture, so the roster-wide
      // count is the right denominator here — the same five games that gate one
      // player also gate the recap, which is why a quiet day costs nothing.
      const teamNewGames =
        teamRow?.force_regenerate || !teamRow?.generated_at
          ? MIN_NEW_GAMES
          : await countRosterGamesSince(admin, teamRow.generated_at as string);

      if (teamNewGames < MIN_NEW_GAMES) {
        result.belowThreshold += 1;
      } else if (hasRoom()) {
        const team = await generateTeamSummary(admin, aiContext);
        result.team = !("notEnoughData" in team);
      } else {
        result.partial = true;
      }
    }

    // Standings go out on the cron only, never on the Settings "Regenerate
    // summaries now" button. Both reach this handler, but one of them is a
    // person clicking a button — and a leaderboard that reposts every time
    // somebody pokes Settings is how a channel gets muted.
    if (isCron) {
      await postDailyStandings(admin);
    }

    // Summaries are opt-in (migration 009). Checked here as well as in the sync
    // that sets the flags, because this is the only place that spends a request
    // — a stale row left behind by an earlier config must not cost anything.
    const { data: enabledPlayers } = await admin
      .from("players")
      .select("id")
      .eq("ai_summary_enabled", true);
    const enabled = new Set((enabledPlayers ?? []).map((p) => p.id as string));

    // Only players whose data actually moved. Oldest first, so a run that gets
    // cut short doesn't keep refreshing the same few and starving the rest.
    const { data: stale } = await admin
      .from("player_ai_summaries")
      .select("player_id, generated_at, force_regenerate")
      .eq("stale", true)
      .order("generated_at", { ascending: true, nullsFirst: true });

    for (const row of stale ?? []) {
      const playerId = row.player_id as string;
      if (!enabled.has(playerId)) continue;
      const generatedAt = row.generated_at as string | null;

      // A human edit — a note, or an AI context change — bypasses the floor.
      // So does a summary that has never been written: there's no baseline to
      // measure five games against, and the player page is showing an empty
      // card until this runs.
      if (!row.force_regenerate && generatedAt) {
        const newGames = await newGamesSince(playerId, generatedAt);
        if (newGames < MIN_NEW_GAMES) {
          // Deliberately leaves stale = true. The games keep accumulating and
          // the next run re-checks; clearing it here would also drop the
          // player page's "new games since" hint while the hint is still true.
          result.belowThreshold += 1;
          continue;
        }
      }

      if (!hasRoom()) {
        result.partial = true;
        result.skipped += 1;
        continue;
      }

      const summary = await generatePlayerSummary(admin, playerId, aiContext);
      if ("notEnoughData" in summary) {
        // Nothing to say yet, but leaving it stale means retrying it every run
        // forever — clear the flag and let the next sync set it again.
        await admin
          .from("player_ai_summaries")
          .update({ stale: false, force_regenerate: false })
          .eq("player_id", playerId);
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
