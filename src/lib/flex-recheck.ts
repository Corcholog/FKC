// Re-judging flex games that were skipped for not being a full stack.
//
// The sync stores a flex game only when five roster players were on one side
// (isFullStack, lib/team/roster.ts). A game that fails the test still gets a
// `matches` row — with `excluded = true` and no participants — so the walk does
// not spend a Riot call re-fetching it on every run.
//
// That marker is the problem this module exists for. The test is applied against
// the roster *and the linked accounts* as they stood the day the game was first
// seen, and it is never applied again. Link a second account for somebody, or
// add a player, and every game they were in on that account stays excluded
// forever — the five were there, the app just could not see that at the time.
// It looks exactly like the games never happened.
//
// The recovery the sync's own comment prescribes: drop the markers, null the
// flex cursors, walk again. Riot keeps match detail indefinitely, so nothing is
// lost by re-fetching — it costs API calls and nothing else.
//
// SoloQ has no equivalent: a soloQ game is stored on its own merits, so nothing
// about it depends on who else was linked.

import type { SupabaseClient } from "@supabase/supabase-js";
import { QUEUE_FLEX } from "@/lib/queues";

export type FlexRecheckSummary = {
  /** Skipped-game markers dropped, so the walk will look at them again. */
  markersCleared: number;
  /** Accounts whose flex cursor was reset. */
  accountsReset: number;
};

export async function clearExcludedFlexGames(
  admin: SupabaseClient,
): Promise<FlexRecheckSummary> {
  // Only the excluded ones. A stored flex game has participants hanging off it
  // and is already counted; deleting it would throw away notes and scores to
  // re-fetch data we have.
  const { data: cleared, error: deleteError } = await admin
    .from("matches")
    .delete()
    .eq("queue_id", QUEUE_FLEX)
    .eq("excluded", true)
    .select("id");
  if (deleteError) throw new Error(deleteError.message);

  // Nulling the cursor is what makes the walk go back for them. Without it the
  // sync starts from the last contiguous point and never reaches the deleted
  // markers, so they are simply gone rather than re-judged.
  const { data: reset, error: cursorError } = await admin
    .from("player_accounts")
    .update({ synced_through_flex: null })
    .eq("track_flex", true)
    .select("puuid");
  if (cursorError) throw new Error(cursorError.message);

  return {
    markersCleared: cleared?.length ?? 0,
    accountsReset: reset?.length ?? 0,
  };
}
