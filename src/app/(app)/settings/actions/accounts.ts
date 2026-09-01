"use server";

// The Riot accounts behind one person.
//
// `player_accounts` is what makes a player a person rather than an account
// (migration 023): the roster flexes on accounts they do not solo queue on, and
// one of them solo queues on another server. Everything here maintains that set
// — adding, removing, choosing which one's Riot ID and rank are mirrored onto
// the player, and which queues each is worth spending Riot calls walking.

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { playerSlug } from "@/lib/slug";
import {
  backfillNewAccount,
  readPlatform,
  resolveAccount,
  revalidateRoster,
} from "@/lib/settings/helpers";

import type { PlayerFormState } from "../form-state";


/**
 * Attaches another Riot account to an existing player.
 *
 * This is the operation the whole migration exists for: a soloQ smurf, an
 * account on another server, or the account the team plays flex on. It never
 * becomes primary automatically — the primary is what the app displays as
 * "their account", and a newly added smurf is not that.
 */
export async function addAccount(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    const { supabase } = await requireSession();

    const playerId = formData.get("playerId") as string;
    const gameName = (formData.get("gameName") as string)?.trim();
    const tagLine = (formData.get("tagLine") as string)?.trim();
    const platform = readPlatform(formData);
    const trackSolo = formData.get("trackSolo") !== null;
    const trackFlex = formData.get("trackFlex") !== null;

    if (!playerId || !gameName || !tagLine) {
      return { error: "Game name and tag line are required." };
    }
    if (!trackSolo && !trackFlex) {
      return { error: "Pick at least one queue to track, or the account will never be synced." };
    }

    const resolved = await resolveAccount(gameName, tagLine, platform);
    if ("error" in resolved) return { error: resolved.error };

    const { error } = await supabase.from("player_accounts").insert({
      puuid: resolved.puuid,
      player_id: playerId,
      riot_game_name: gameName,
      riot_tag_line: tagLine,
      platform,
      is_primary: false,
      track_solo: trackSolo,
      track_flex: trackFlex,
    });

    if (error) {
      return {
        error:
          error.code === "23505"
            ? "That Riot account is already attached to a player."
            : error.message,
      };
    }

    const message = await backfillNewAccount(resolved.puuid, "Account added");
    revalidateRoster();
    return { success: true, message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/** Which queues an account is worth spending Riot calls on. */
export async function setAccountQueues(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    const { supabase } = await requireSession();

    const puuid = formData.get("puuid") as string;
    const trackSolo = formData.get("trackSolo") !== null;
    const trackFlex = formData.get("trackFlex") !== null;
    if (!puuid) return { error: "Account not found." };

    const { error } = await supabase
      .from("player_accounts")
      .update({ track_solo: trackSolo, track_flex: trackFlex })
      .eq("puuid", puuid);
    if (error) return { error: error.message };

    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/**
 * Moves the primary flag, and the denormalised copy that follows it.
 *
 * Two writes because a partial unique index allows only one primary per player:
 * the incumbent has to be cleared before the new one is set, or the second
 * write fails on the index.
 */
export async function setPrimaryAccount(puuid: string): Promise<void> {
  const { supabase } = await requireSession();

  const { data: account, error: fetchError } = await supabase
    .from("player_accounts")
    .select("player_id, riot_game_name, riot_tag_line, platform")
    .eq("puuid", puuid)
    .single();
  if (fetchError || !account) throw new Error("Account not found.");

  const playerId = account.player_id as string;

  const { error: clearError } = await supabase
    .from("player_accounts")
    .update({ is_primary: false })
    .eq("player_id", playerId);
  if (clearError) throw new Error(clearError.message);

  const { error: setError } = await supabase
    .from("player_accounts")
    .update({ is_primary: true })
    .eq("puuid", puuid);
  if (setError) throw new Error(setError.message);

  const gameName = account.riot_game_name as string;
  const tagLine = account.riot_tag_line as string;
  const { error: playerError } = await supabase
    .from("players")
    .update({
      riot_game_name: gameName,
      riot_tag_line: tagLine,
      slug: playerSlug(gameName, tagLine),
      platform: account.platform,
    })
    .eq("id", playerId);
  if (playerError) throw new Error(playerError.message);

  revalidateRoster();
}

/**
 * Detaches an account.
 *
 * The match rows it contributed stay: a game is a game, and the participant
 * rows point at the *player*, not the account. What goes is the account's own
 * LP series, which cascades — a smurf's rank curve means nothing once the smurf
 * is no longer part of the picture.
 *
 * The primary account can't be removed while another exists, because the
 * player's Riot ID and rank are mirrored from it; promote a different one
 * first. Removing the last account is allowed, and leaves a player the sync
 * skips — which is how somebody who has quit stops costing Riot calls without
 * deleting their history.
 */
export async function removeAccount(puuid: string): Promise<void> {
  const { supabase } = await requireSession();

  const { data: account, error: fetchError } = await supabase
    .from("player_accounts")
    .select("player_id, is_primary")
    .eq("puuid", puuid)
    .single();
  if (fetchError || !account) throw new Error("Account not found.");

  if (account.is_primary) {
    const { count } = await supabase
      .from("player_accounts")
      .select("puuid", { count: "exact", head: true })
      .eq("player_id", account.player_id);
    if ((count ?? 0) > 1) {
      throw new Error(
        "That's the primary account. Make another one primary before removing it.",
      );
    }
  }

  const { error } = await supabase.from("player_accounts").delete().eq("puuid", puuid);
  if (error) throw new Error(error.message);

  revalidateRoster();
}
