"use server";

// The Riot key, and the one manual read that isn't a normal sync.
//
// The key lives in `sync_state` rather than an env var so a 24-hour development
// key can be rotated without a redeploy (ADR-002), which is why setting it is a
// form rather than a deployment.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth";
import { RiotKeyInvalidError, refetchMatchDetails } from "@/lib/sync";
import { recomputeScores } from "@/lib/score-recompute";
import { clearExcludedFlexGames } from "@/lib/flex-recheck";

import type { PlayerFormState } from "../form-state";


export async function updateRiotKey(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    // The session is the gate; the write itself goes through the admin client,
    // because migration 011 left authenticated with no write grant on
    // sync_state at all (it's the table holding the key in plaintext).
    await requireSession();

    const key = (formData.get("riotApiKey") as string)?.trim();
    if (!key) return { error: "Riot API key is required." };

    // Optimistic reset — flips back to false on the next sync if it's still bad.
    const { error } = await createAdminClient()
      .from("sync_state")
      .update({ riot_api_key: key, riot_key_valid: true, last_error: null })
      .eq("id", 1);
    if (error) return { error: error.message };

    revalidatePath("/settings");
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/**
 * Re-reads match detail for every stored match and rewrites its participant
 * rows. Only useful after a migration widens what's captured — rows synced
 * before it hold NULLs in the new columns, and Riot keeps match detail
 * available indefinitely, so this is the one way to fill them in.
 *
 * Rate-limited and time-boxed like a sync, so a large history needs the button
 * pressed more than once. Each run resumes where the last stopped.
 */
// Takes no arguments — there is nothing to configure, and useActionState is
// happy with an action that ignores the state/formData it would have passed.
export async function refetchMatchDetailsAction(): Promise<PlayerFormState> {
  try {
    await requireSession();

    const admin = createAdminClient();
    const summary = await refetchMatchDetails(admin);

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/matches");

    if (summary.partial) {
      return {
        success: true,
        message: `Updated ${summary.matchesUpdated} match(es). ${summary.remaining} left — run it again to continue.`,
      };
    }
    return {
      success: true,
      message:
        summary.matchesUpdated === 0
          ? "Every match already has full detail."
          : `Updated ${summary.matchesUpdated} match(es). All done.`,
    };
  } catch (e) {
    if (e instanceof RiotKeyInvalidError) {
      await createAdminClient().from("sync_state").update({ riot_key_valid: false }).eq("id", 1);
      revalidatePath("/settings");
      return { error: "Riot API key is invalid or expired." };
    }
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/**
 * Recomputes match_participants.performance_score from the rows already stored.
 *
 * Touches Riot not at all — unlike every other action in this file, which is
 * why it has no RiotKeyInvalidError branch. The score is a cache of the pure
 * function in lib/score.ts over data the database already holds, so this is the
 * one maintenance button that works with an expired key.
 *
 * Two occasions call for it: right after migration 030, and after a change to
 * the formula. The second needs `update match_participants set
 * performance_score = null;` in the SQL editor first — see the header of
 * lib/score-recompute.ts for why that is a deliberate manual step.
 */
export async function recomputeScoresAction(): Promise<PlayerFormState> {
  try {
    await requireSession();

    const summary = await recomputeScores(createAdminClient());

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/matches");
    revalidatePath("/soloq");
    revalidatePath("/players");

    if (summary.partial) {
      return {
        success: true,
        message: `Scored ${summary.matchesScored} match(es). ${summary.remaining} row(s) left — run it again to continue.`,
      };
    }
    return {
      success: true,
      message:
        summary.matchesScored === 0
          ? "Every match that can be scored already is."
          : `Scored ${summary.matchesScored} match(es). All done.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/**
 * Makes the next sync re-judge every flex game it previously skipped.
 *
 * Needed whenever the roster or the set of linked accounts changes: the
 * full-stack test that decides whether a flex game counts is applied once, when
 * the game is first seen, and a game skipped under an older account list stays
 * skipped. See lib/flex-recheck.ts.
 *
 * This only clears the way — it makes no Riot calls itself. The work happens on
 * the next Sync, and a long history needs several.
 */
export async function recheckFlexGamesAction(): Promise<PlayerFormState> {
  try {
    await requireSession();

    const summary = await clearExcludedFlexGames(createAdminClient());

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/matches");

    return {
      success: true,
      message:
        summary.markersCleared === 0
          ? "No skipped flex games to re-check."
          : `Cleared ${summary.markersCleared} skipped flex game(s) across ${summary.accountsReset} account(s). Press Sync to re-check them — it may take a few runs.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
