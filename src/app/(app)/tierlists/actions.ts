"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { normalizeTiers, type Tier } from "@/lib/tierlist";

export type TierListActionResult = { error?: string };

// These take typed arguments instead of FormData: the board's state is a nested
// array, and a form would mean serializing it into a hidden input and parsing it
// back for nothing. They're still called from a transition, so the pending state
// works the same way as the FormData actions elsewhere.

export async function saveTierList(
  playerId: string,
  tiers: Tier[],
): Promise<TierListActionResult> {
  try {
    const { supabase, user } = await requireSession();
    if (!playerId) return { error: "Missing player." };

    // Tier lists belong to people, and people are the roster rows with a login.
    // The pages already filter on this; checking again here is what stops a
    // hand-rolled action call from creating one for a tracked-only account.
    const { data: owner } = await supabase
      .from("players")
      .select("user_id")
      .eq("id", playerId)
      .maybeSingle<{ user_id: string | null }>();
    if (!owner?.user_id) return { error: "That player has no account to own a tier list." };

    // Never trust what came off the wire: the client could send anything, and
    // even an honest client can be a patch behind on the champion roster.
    const version = await getLatestVersion();
    const championMap = await getChampionMap(version);
    const normalized = normalizeTiers(tiers, new Set(championMap.keys()));

    if (normalized.length === 0) return { error: "A tier list needs at least one tier." };

    const { data, error } = await supabase
      .from("champion_tier_lists")
      .upsert(
        {
          player_id: playerId,
          tiers: normalized,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: "player_id" },
      )
      .select("player_id");

    if (error) return { error: error.message };
    // RLS refusals come back as zero rows rather than an error.
    if (!data || data.length === 0) {
      return { error: "That save was blocked. Try signing out and back in." };
    }

    revalidatePath("/tierlists");
    revalidatePath("/tierlists/[slug]", "page");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save the tier list." };
  }
}

export async function deleteTierList(playerId: string): Promise<TierListActionResult> {
  try {
    const { supabase } = await requireSession();
    if (!playerId) return { error: "Missing player." };

    const { data, error } = await supabase
      .from("champion_tier_lists")
      .delete()
      .eq("player_id", playerId)
      .select("player_id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "There was no tier list to delete." };

    revalidatePath("/tierlists");
    revalidatePath("/tierlists/[slug]", "page");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not delete the tier list." };
  }
}
