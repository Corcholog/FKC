"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth";
import {
  getPuuidByRiotId,
  describeRiotError,
  DEFAULT_PLATFORM,
  SUPPORTED_PLATFORMS,
} from "@/lib/riot";
import { backfillAccountHistory, refetchMatchDetails, RiotKeyInvalidError } from "@/lib/sync";
import { MAX_CLAN_CONTEXT_CHARS, MAX_PLAYER_CONTEXT_CHARS } from "@/lib/ai-context";
import { playerSlug } from "@/lib/slug";
import {
  DEMO_SUMMARY_DRAFT_SOURCE,
  DEMO_SUMMARY_SOURCE,
  DEMO_TEAM_SUMMARY_DRAFT_SOURCE,
  DEMO_TEAM_SUMMARY_SOURCE,
} from "@/lib/summary-analyst";

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

/**
 * Resolves a Riot ID to a puuid, or returns a message fit for the form.
 *
 * Every account-creating path needs the same three steps — read the key,
 * resolve, translate the failure — and they were duplicated across addPlayer
 * and updatePlayer before accounts existed. Now there are four of them.
 */
async function resolveAccount(
  gameName: string,
  tagLine: string,
  platform: string,
): Promise<{ puuid: string } | { error: string }> {
  const apiKey = await getRiotApiKey();
  try {
    return { puuid: await getPuuidByRiotId(gameName, tagLine, apiKey, platform) };
  } catch (e) {
    return { error: describeRiotError(e, gameName, tagLine) };
  }
}

function readPlatform(formData: FormData): string {
  const raw = (formData.get("platform") as string)?.trim().toUpperCase();
  return raw && SUPPORTED_PLATFORMS.includes(raw) ? raw : DEFAULT_PLATFORM;
}

/**
 * Walks a newly attached account's history straight away.
 *
 * Shared by every path that creates one, because they all have the same
 * problem: a new account has no cursor, so the daily sync would discover it
 * 200 match ids at a time over several days. Failure here is reported as
 * partial success — the account is attached either way, and the next sync
 * picks the history up.
 */
async function backfillNewAccount(puuid: string, label: string): Promise<string> {
  const admin = createAdminClient();
  try {
    const summary = await backfillAccountHistory(admin, puuid);
    const suffix = summary.partial ? " Hit the rate limit — sync again to finish." : "";
    return `${label} — backfilled ${summary.newMatches} match(es).${suffix}`;
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
    return `${label}, but the history backfill failed: ${detail} Run a regular sync once the issue is resolved.`;
  }
}

function revalidateRoster() {
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/team");
  revalidatePath("/player/[slug]", "page");
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
    const platform = readPlatform(formData);
    const avatarFile = formData.get("avatar") as File | null;

    if (!gameName || !tagLine || !displayName) {
      return { error: "Game name, tag line, and display name are required." };
    }

    const resolved = await resolveAccount(gameName, tagLine, platform);
    if ("error" in resolved) return { error: resolved.error };

    // The player row is created first so its generated id exists to key both the
    // avatar object and the account row. The avatar is uploaded second because
    // it is the only step that writes outside Postgres — a failure after it
    // would leave an orphaned object with nothing pointing at it.
    const { data: created, error: insertError } = await supabase
      .from("players")
      .insert({
        riot_game_name: gameName,
        riot_tag_line: tagLine,
        display_name: displayName,
        slug: playerSlug(gameName, tagLine),
        platform,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      return {
        error:
          insertError?.code === "23505"
            ? "This player's display name is already taken."
            : (insertError?.message ?? "Could not add the player."),
      };
    }

    const playerId = created.id as string;

    const { error: accountError } = await supabase.from("player_accounts").insert({
      puuid: resolved.puuid,
      player_id: playerId,
      riot_game_name: gameName,
      riot_tag_line: tagLine,
      platform,
      is_primary: true,
      track_solo: true,
    });

    if (accountError) {
      // Compensating rollback — PostgREST has no client-side transaction, and a
      // player with no account is a row the sync will never look at and the
      // settings page can't repair.
      await supabase.from("players").delete().eq("id", playerId);
      return {
        error:
          accountError.code === "23505"
            ? "That Riot account is already attached to a player."
            : accountError.message,
      };
    }

    if (avatarFile && avatarFile.size > 0) {
      const avatarUrl = await uploadAvatar(avatarFile, playerId);
      await supabase.from("players").update({ avatar_url: avatarUrl }).eq("id", playerId);
    }

    const message = await backfillNewAccount(resolved.puuid, "Player added");
    revalidateRoster();
    return { success: true, message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/**
 * Edits the person: their display fields, and their primary account's Riot ID.
 *
 * The Riot ID edit here is for a *rename*. Pointing a roster slot at a
 * genuinely different Riot account is `addAccount` now — it used to be an
 * UPDATE of players.id, which meant swapping accounts threw the old account's
 * history away. Keeping both is strictly better and is the entire point of
 * player_accounts, so this refuses rather than doing the destructive thing.
 */
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

    const { data: primary, error: primaryError } = await supabase
      .from("player_accounts")
      .select("puuid, platform")
      .eq("player_id", id)
      .eq("is_primary", true)
      .maybeSingle();
    if (primaryError) return { error: primaryError.message };
    if (!primary) return { error: "This player has no primary account to edit." };

    const renamed =
      existing.riot_game_name !== gameName || existing.riot_tag_line !== tagLine;

    if (renamed) {
      const resolved = await resolveAccount(gameName, tagLine, primary.platform as string);
      if ("error" in resolved) return { error: resolved.error };

      // A cosmetic rename resolves to the same puuid. A different one means
      // this is a different account, which is an addAccount, not an edit.
      if (resolved.puuid !== primary.puuid) {
        return {
          error:
            `${gameName}#${tagLine} is a different Riot account, not a rename. ` +
            "Add it as an account on this player instead — that keeps the history of both.",
        };
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

    // Written in both places on purpose: player_accounts owns the Riot ID, and
    // players carries a copy of the primary account's so the dozens of read
    // sites that render "their Riot ID" need no join. The copy is only ever
    // written here and by the sync's roll-up.
    const { error } = await supabase
      .from("players")
      .update({
        riot_game_name: gameName,
        riot_tag_line: tagLine,
        slug: playerSlug(gameName, tagLine),
        avatar_url: avatarUrl,
      })
      .eq("id", id);
    if (error) {
      return {
        error:
          error.code === "23505"
            ? "This Riot ID conflicts with another tracked player."
            : error.message,
      };
    }

    if (renamed) {
      const { error: accountError } = await supabase
        .from("player_accounts")
        .update({ riot_game_name: gameName, riot_tag_line: tagLine })
        .eq("puuid", primary.puuid);
      if (accountError) return { error: accountError.message };
    }

    revalidateRoster();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

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
 * The two kinds of demo prose this action can publish, and the only two.
 *
 * The form posts a `kind`, not a source. A source string straight off a form
 * would let this write *any* demo_text row — including a champion note or an
 * opponent's blurb, published under the wrong id, from a field nobody validates.
 * A closed map means an unrecognised kind is an error rather than a write.
 */
const DEMO_TEXT_KINDS = {
  player: { published: DEMO_SUMMARY_SOURCE, draft: DEMO_SUMMARY_DRAFT_SOURCE },
  team: { published: DEMO_TEAM_SUMMARY_SOURCE, draft: DEMO_TEAM_SUMMARY_DRAFT_SOURCE },
} as const;

/**
 * Saves one reviewed demo summary, or clears it.
 *
 * Separate from generation on purpose. /api/demo-summaries writes drafts; this
 * is the step where a person decides a draft is fit to publish, and the two
 * being separate is what keeps unattended output off a page with no login in
 * front of it.
 *
 * An empty body is a legitimate save, not a no-op: demo_player_summaries and
 * demo_team_summary both filter out blank bodies, so clearing this box
 * unpublishes that card without deleting the row someone might want to edit
 * back.
 */
export async function saveDemoSummary(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    await requireSession();

    const kind = (formData.get("kind") as string) ?? "player";
    const sources = DEMO_TEXT_KINDS[kind as keyof typeof DEMO_TEXT_KINDS];
    if (!sources) return { error: `Unknown summary kind "${kind}".` };

    // The recap's row id is a constant rather than a player id, but demo_text is
    // keyed the same way either way, so the write below doesn't branch.
    const playerId = (formData.get("playerId") as string) ?? "";
    if (!playerId) return { error: "Missing player." };
    const body = ((formData.get("body") as string) ?? "").trim();

    // Both rows, in one statement. The published row is what /demo serves; the
    // draft row is the working copy this textarea is bound to, and letting them
    // drift after a hand edit would mean the next "Generate missing" run saw no
    // draft and rewrote text somebody had just fixed.
    //
    // Admin client: demo_text is authenticated-only at the RLS level, and the
    // rest of this feature's writes already go through the service role.
    const updatedAt = new Date().toISOString();
    const { error } = await createAdminClient()
      .from("demo_text")
      .upsert(
        [sources.published, sources.draft].map((source) => ({
          source,
          row_id: playerId,
          body,
          updated_at: updatedAt,
        })),
        { onConflict: "source,row_id" },
      );
    if (error) return { error: error.message };

    // The demo caches its reads for an hour (lib/loaders/demo-cache.ts) under
    // the "demo" tag. Without this, publishing appears to do nothing for up to
    // an hour — you open the page you just published to and the card isn't there.
    //
    // revalidateTag rather than updateTag: unstable_cache's `tags` option is
    // documented against revalidateTag, while updateTag is documented against
    // cacheTag and fetch tags, which this app doesn't use. "max" is
    // stale-while-revalidate, so the first visit after publishing still serves
    // the old page and kicks off the refresh — hence the message below.
    revalidateTag("demo", "max");
    revalidatePath("/settings");
    return {
      success: true,
      message: body
        ? "Published. Reload /demo once to see it — the demo serves one stale response first."
        : "Taken down. It'll be gone from /demo after one reload.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
