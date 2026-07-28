"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPuuidByRiotId, describeRiotError } from "@/lib/riot";
import { backfillPlayerHistory, RiotKeyInvalidError } from "@/lib/sync";

import type { PlayerFormState } from "./form-state";

async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  return supabase;
}

async function getRiotApiKey(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("sync_state")
    .select("riot_api_key")
    .eq("id", 1)
    .single();

  if (error || !data?.riot_api_key) {
    throw new Error(
      "No Riot API key set yet — add one to sync_state.riot_api_key in the Supabase SQL editor first.",
    );
  }
  return data.riot_api_key as string;
}

function avatarPathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = "/avatars/";
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

async function uploadAvatar(file: File, playerId: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${playerId}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(`Avatar upload failed: ${error.message}`);
  const { data } = admin.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

async function deleteAvatar(url: string | null) {
  const path = avatarPathFromUrl(url);
  if (!path) return;
  const admin = createAdminClient();
  await admin.storage.from("avatars").remove([path]);
}

export async function addPlayer(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    const supabase = await requireSession();

    const gameName = (formData.get("gameName") as string)?.trim();
    const tagLine = (formData.get("tagLine") as string)?.trim();
    const displayName = (formData.get("displayName") as string)?.trim();
    const avatarFile = formData.get("avatar") as File | null;

    if (!gameName || !tagLine || !displayName) {
      return { error: "Game name, tag line, and display name are required." };
    }

    const apiKey = await getRiotApiKey(supabase);

    let puuid: string;
    try {
      puuid = await getPuuidByRiotId(gameName, tagLine, apiKey);
    } catch (e) {
      return { error: describeRiotError(e, gameName, tagLine) };
    }

    const playerId = randomUUID();
    const avatarUrl = avatarFile && avatarFile.size > 0 ? await uploadAvatar(avatarFile, playerId) : null;

    const { error } = await supabase.from("players").insert({
      id: playerId,
      riot_puuid: puuid,
      riot_game_name: gameName,
      riot_tag_line: tagLine,
      display_name: displayName,
      avatar_url: avatarUrl,
      platform: "LA2",
    });

    if (error) {
      if (avatarUrl) await deleteAvatar(avatarUrl);
      return {
        error: error.code === "23505" ? "This player is already tracked." : error.message,
      };
    }

    revalidatePath("/admin");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function updatePlayer(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    const supabase = await requireSession();

    const id = formData.get("id") as string;
    const gameName = (formData.get("gameName") as string)?.trim();
    const tagLine = (formData.get("tagLine") as string)?.trim();
    const displayName = (formData.get("displayName") as string)?.trim();
    const avatarFile = formData.get("avatar") as File | null;
    const removeAvatar = formData.get("removeAvatar") === "on";

    if (!id || !gameName || !tagLine || !displayName) {
      return { error: "Game name, tag line, and display name are required." };
    }

    const { data: existing, error: fetchError } = await supabase
      .from("players")
      .select("riot_game_name, riot_tag_line, avatar_url")
      .eq("id", id)
      .single();

    if (fetchError || !existing) return { error: "Player not found." };

    let puuid: string | undefined;
    if (existing.riot_game_name !== gameName || existing.riot_tag_line !== tagLine) {
      const apiKey = await getRiotApiKey(supabase);
      try {
        puuid = await getPuuidByRiotId(gameName, tagLine, apiKey);
      } catch (e) {
        return { error: describeRiotError(e, gameName, tagLine) };
      }
    }

    let avatarUrl = existing.avatar_url as string | null;
    if (avatarFile && avatarFile.size > 0) {
      await deleteAvatar(avatarUrl);
      avatarUrl = await uploadAvatar(avatarFile, id);
    } else if (removeAvatar) {
      await deleteAvatar(avatarUrl);
      avatarUrl = null;
    }

    const update: Record<string, unknown> = {
      riot_game_name: gameName,
      riot_tag_line: tagLine,
      display_name: displayName,
      avatar_url: avatarUrl,
    };
    if (puuid) update.riot_puuid = puuid;

    const { error } = await supabase.from("players").update(update).eq("id", id);
    if (error) return { error: error.message };

    // Riot ID changed means a new puuid — old history was tied to the old
    // account and has nothing in common with the new one, so wait-for-the-
    // next-daily-sync won't reliably catch up (see the pagination-cap edge
    // case noted in syncPlayerMatches). Backfill this player's full history
    // since the tracking start date right now instead.
    if (puuid) {
      const admin = createAdminClient();
      try {
        const backfillSummary = await backfillPlayerHistory(admin, id);
        revalidatePath("/admin");
        revalidatePath("/");
        revalidatePath(`/player/${id}`);
        return {
          success: true,
          message: `Riot ID updated — backfilled ${backfillSummary.newMatches} match(es) since tracking started.`,
        };
      } catch (e) {
        const isKeyInvalid = e instanceof RiotKeyInvalidError;
        if (isKeyInvalid) {
          await admin.from("sync_state").update({ riot_key_valid: false }).eq("id", 1);
        }
        const detail = isKeyInvalid
          ? "Riot API key is invalid or expired."
          : e instanceof Error
            ? e.message
            : "Unknown error.";
        revalidatePath("/admin");
        return {
          success: true,
          message: `Riot ID updated, but the history backfill failed: ${detail} Run a regular sync once the issue is resolved.`,
        };
      }
    }

    revalidatePath("/admin");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function updateRiotKey(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    const supabase = await requireSession();

    const key = (formData.get("riotApiKey") as string)?.trim();
    if (!key) return { error: "Riot API key is required." };

    // Optimistic reset — flips back to false on the next sync if it's still bad.
    const { error } = await supabase
      .from("sync_state")
      .update({ riot_api_key: key, riot_key_valid: true, last_error: null })
      .eq("id", 1);
    if (error) return { error: error.message };

    revalidatePath("/admin");
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function deletePlayer(id: string): Promise<void> {
  const supabase = await requireSession();

  const { data: existing } = await supabase
    .from("players")
    .select("avatar_url")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await deleteAvatar((existing?.avatar_url as string | null) ?? null);

  revalidatePath("/admin");
}
