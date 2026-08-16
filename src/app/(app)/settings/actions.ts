"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth";
import { getPuuidByRiotId, describeRiotError } from "@/lib/riot";
import { backfillPlayerHistory, refetchMatchDetails, RiotKeyInvalidError } from "@/lib/sync";
import { MAX_CLAN_CONTEXT_CHARS, MAX_PLAYER_CONTEXT_CHARS } from "@/lib/ai-context";
import { playerSlug } from "@/lib/slug";
import { DEMO_SUMMARY_SOURCE } from "@/lib/summary-analyst";

import type { PlayerFormState } from "./form-state";

// Admin client, not the caller's session: since migration 011 the authenticated
// role has no grant on sync_state.riot_api_key, so a session client reading this
// gets a permission error rather than the key. The gate is requireSession() in
// each caller — this function is only ever reached from an authed action.
async function getRiotApiKey() {
  const { data, error } = await createAdminClient()
    .from("sync_state")
    .select("riot_api_key")
    .eq("id", 1)
    .single();

  if (error || !data?.riot_api_key) {
    throw new Error(
      "No Riot API key set yet — add one from the Riot API key form above first.",
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
    const { supabase } = await requireSession();

    const gameName = (formData.get("gameName") as string)?.trim();
    const tagLine = (formData.get("tagLine") as string)?.trim();
    const displayName = (formData.get("displayName") as string)?.trim();
    const avatarFile = formData.get("avatar") as File | null;

    if (!gameName || !tagLine || !displayName) {
      return { error: "Game name, tag line, and display name are required." };
    }

    const apiKey = await getRiotApiKey();

    let puuid: string;
    try {
      puuid = await getPuuidByRiotId(gameName, tagLine, apiKey);
    } catch (e) {
      return { error: describeRiotError(e, gameName, tagLine) };
    }

    const avatarUrl = avatarFile && avatarFile.size > 0 ? await uploadAvatar(avatarFile, puuid) : null;

    const { error } = await supabase.from("players").insert({
      id: puuid,
      riot_game_name: gameName,
      riot_tag_line: tagLine,
      display_name: displayName,
      slug: playerSlug(gameName, tagLine),
      avatar_url: avatarUrl,
      platform: "LA2",
    });

    if (error) {
      if (avatarUrl) await deleteAvatar(avatarUrl);
      return {
        error:
          error.code === "23505"
            ? "This player's Riot ID or display name is already tracked."
            : error.message,
      };
    }

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/team");
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
    const { supabase } = await requireSession();

    const id = formData.get("id") as string;
    const gameName = (formData.get("gameName") as string)?.trim();
    const tagLine = (formData.get("tagLine") as string)?.trim();
    const avatarFile = formData.get("avatar") as File | null;
    const removeAvatar = formData.get("removeAvatar") === "on";

    if (!id || !gameName || !tagLine) {
      return { error: "Game name and tag line are required." };
    }

    const { data: existing, error: fetchError } = await supabase
      .from("players")
      .select("riot_game_name, riot_tag_line, avatar_url")
      .eq("id", id)
      .single();

    if (fetchError || !existing) return { error: "Player not found." };

    let newPuuid: string | undefined;
    if (existing.riot_game_name !== gameName || existing.riot_tag_line !== tagLine) {
      const apiKey = await getRiotApiKey();
      try {
        newPuuid = await getPuuidByRiotId(gameName, tagLine, apiKey);
      } catch (e) {
        return { error: describeRiotError(e, gameName, tagLine) };
      }
    }

    // A cosmetic Riot ID rename resolves to the same puuid — only a genuine
    // account swap on this roster slot changes it and needs history backfilled.
    const accountChanged = newPuuid !== undefined && newPuuid !== id;
    const finalId = accountChanged ? (newPuuid as string) : id;

    let avatarUrl = existing.avatar_url as string | null;
    if (avatarFile && avatarFile.size > 0) {
      await deleteAvatar(avatarUrl);
      avatarUrl = await uploadAvatar(avatarFile, finalId);
    } else if (removeAvatar) {
      await deleteAvatar(avatarUrl);
      avatarUrl = null;
    }

    const update: Record<string, unknown> = {
      riot_game_name: gameName,
      riot_tag_line: tagLine,
      slug: playerSlug(gameName, tagLine),
      avatar_url: avatarUrl,
    };
    if (accountChanged) update.id = finalId;

    const { error } = await supabase.from("players").update(update).eq("id", id);
    if (error) {
      return {
        error:
          error.code === "23505"
            ? "This Riot ID conflicts with another tracked player."
            : error.message,
      };
    }

    // A genuine account swap means the new puuid's history has nothing in
    // common with the old one, so wait-for-the-next-daily-sync won't reliably
    // catch up (see the pagination-cap edge case noted in syncPlayerMatches).
    // Backfill this player's full history since the tracking start date now.
    if (accountChanged) {
      const admin = createAdminClient();
      try {
        const backfillSummary = await backfillPlayerHistory(admin, finalId);
        revalidatePath("/settings");
        revalidatePath("/");
        revalidatePath("/team");
        revalidatePath("/player/[slug]", "page");
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
        revalidatePath("/settings");
        return {
          success: true,
          message: `Riot ID updated, but the history backfill failed: ${detail} Run a regular sync once the issue is resolved.`,
        };
      }
    }

    revalidatePath("/settings");
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

// ------------------------------------------------------------
// AI prompt context
//
// Free text that gets dropped into every Gemini prompt — see src/lib/ai-context.ts
// for the split between the shared clan blurb and the per-player one, and why
// both live in the database rather than in the repo.
// ------------------------------------------------------------

export async function updateClanContext(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    const { supabase } = await requireSession();

    const context = ((formData.get("context") as string) ?? "").trim();
    if (context.length > MAX_CLAN_CONTEXT_CHARS) {
      return { error: `Keep it under ${MAX_CLAN_CONTEXT_CHARS} characters.` };
    }

    const { error } = await supabase
      .from("clan_profile")
      .upsert(
        { id: 1, context: context || null, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
    if (error) return { error: error.message };

    // Everything the AI writes is now based on different context, so the next
    // scheduled run should redo all of it.
    await markEverythingStale();

    revalidatePath("/settings");
    return { success: true, message: "Saved. It'll be used on the next summary run." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function updatePlayerAiContext(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    const { supabase } = await requireSession();

    const playerId = formData.get("playerId") as string;
    const context = ((formData.get("aiContext") as string) ?? "").trim();
    if (!playerId) return { error: "Player is required." };
    if (context.length > MAX_PLAYER_CONTEXT_CHARS) {
      return { error: `Keep it under ${MAX_PLAYER_CONTEXT_CHARS} characters.` };
    }

    const { error } = await supabase
      .from("players")
      .update({ ai_context: context || null })
      .eq("id", playerId);
    if (error) return { error: error.message };

    // This player's own summary and the team one both quote it. Overrides the
    // batch's new-games floor: someone editing this expects to see it reflected,
    // not to wait until they've played five more games.
    await supabase
      .from("player_ai_summaries")
      .upsert(
        { player_id: playerId, stale: true, force_regenerate: true },
        { onConflict: "player_id" },
      );
    await supabase
      .from("team_ai_summary")
      .update({ stale: true, force_regenerate: true })
      .eq("id", 1);

    revalidatePath("/settings");
    return { success: true, message: "Saved. It'll be used on the next summary run." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

// The clan context reaches every prompt, so editing it invalidates everything —
// and with force_regenerate, does so past the batch's new-games floor. This is
// the one action that can make the next run cost a full roster of requests, so
// it's also the one most likely to end partial. That's fine: the flags survive
// and the next run picks up whoever it didn't reach, oldest first.
async function markEverythingStale() {
  const admin = createAdminClient();
  await admin
    .from("player_ai_summaries")
    .update({ stale: true, force_regenerate: true })
    .not("player_id", "is", null);
  await admin
    .from("team_ai_summary")
    .update({ stale: true, force_regenerate: true })
    .eq("id", 1);
}

// Note: there is deliberately no "regenerate summaries" server action here.
// The batch needs a time budget and a maxDuration — a roster's worth of Gemini
// calls does not fit in the default server-action timeout — and that already
// exists in /api/summaries. The Settings button POSTs to that route instead, so
// the cron and the button run exactly the same code under the same limits.

export async function deletePlayer(id: string): Promise<void> {
  const { supabase } = await requireSession();

  const { data: existing } = await supabase
    .from("players")
    .select("avatar_url, user_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await deleteAvatar((existing?.avatar_url as string | null) ?? null);

  // Don't leave an orphan login that can still sign in with no player attached.
  const linkedUserId = (existing?.user_id as string | null) ?? null;
  if (linkedUserId) {
    await createAdminClient().auth.admin.deleteUser(linkedUserId);
  }

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/team");
}

// ------------------------------------------------------------
// Player logins
//
// Accounts are created here rather than through a public signup route — the
// site stays private. players.user_id is revoked from the `authenticated` role
// (see docs/schema.sql), so linking must go through the service-role client.
//
// Supabase Auth has no username-only mode — every row in auth.users needs an
// email. Since a player only ever signs in with their display name (see
// resolve_login_email in docs/schema.sql), that email is never seen or typed
// by anyone: assign a random address on the RFC 2606 "always invalid" TLD, purely
// to satisfy Supabase's format check. email_confirm below means nothing is ever
// sent to it.
// ------------------------------------------------------------

const PLACEHOLDER_EMAIL_DOMAIN = "player.invalid";

export async function createPlayerLogin(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    await requireSession();

    const playerId = formData.get("playerId") as string;
    const password = formData.get("password") as string;

    if (!playerId || !password) {
      return { error: "Password is required." };
    }
    if (password.length < 8) {
      return { error: "Password must be at least 8 characters." };
    }

    const admin = createAdminClient();
    const placeholderEmail = `${randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: placeholderEmail,
      password,
      email_confirm: true, // no SMTP configured — the account is usable immediately
    });
    if (createError || !created.user) {
      return { error: createError?.message ?? "Could not create the login." };
    }

    const { error: linkError } = await admin
      .from("players")
      .update({ user_id: created.user.id })
      .eq("id", playerId);
    if (linkError) {
      // Roll back so a failed link doesn't strand an unusable auth user.
      await admin.auth.admin.deleteUser(created.user.id);
      return {
        error:
          linkError.code === "23505"
            ? "That login is already linked to another player."
            : linkError.message,
      };
    }

    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/**
 * Deletes the auth user and clears the link. Not a pure unlink: an orphan login
 * with no player attached could still sign in and read the whole private site.
 * Their notes survive but lose their author (author_user_id is `on delete set
 * null`), so they become read-only until a new login writes new ones.
 */
export async function removePlayerLogin(playerId: string): Promise<void> {
  await requireSession();

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("players")
    .select("user_id")
    .eq("id", playerId)
    .single();

  const linkedUserId = (existing?.user_id as string | null) ?? null;
  if (!linkedUserId) return;

  const { error } = await admin.from("players").update({ user_id: null }).eq("id", playerId);
  if (error) throw new Error(error.message);

  await admin.auth.admin.deleteUser(linkedUserId);

  revalidatePath("/settings");
}

// ------------------------------------------------------------
// Demo summaries
// ------------------------------------------------------------

/**
 * Saves one reviewed demo summary, or clears it.
 *
 * Separate from generation on purpose. /api/demo-summaries writes drafts; this
 * is the step where a person decides a draft is fit to publish, and the two
 * being separate is what keeps unattended output off a page with no login in
 * front of it.
 *
 * An empty body is a legitimate save, not a no-op: demo_player_summaries
 * filters out blank bodies, so clearing this box unpublishes that player's card
 * without deleting the row someone might want to edit back.
 */
export async function saveDemoSummary(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    await requireSession();

    const playerId = (formData.get("playerId") as string) ?? "";
    if (!playerId) return { error: "Missing player." };
    const body = ((formData.get("body") as string) ?? "").trim();

    // Admin client: demo_text is authenticated-only at the RLS level, but the
    // grant that matters here is the write, and the rest of this feature's
    // writes already go through the service role from the API route.
    const { error } = await createAdminClient().from("demo_text").upsert(
      {
        source: DEMO_SUMMARY_SOURCE,
        row_id: playerId,
        body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source,row_id" },
    );
    if (error) return { error: error.message };

    revalidatePath("/settings");
    return {
      success: true,
      message: body ? "Published to the demo." : "Cleared — this player's demo card is now hidden.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
