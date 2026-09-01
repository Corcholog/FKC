"use server";

// Who is on the team, and who can sign in as them.
//
// The roster is five seats and all five are full (migration 028), so adding
// somebody means removing somebody first — `deletePlayer` frees a position and
// `addPlayer` fills it. That is deliberately two steps: everything the departing
// player played stays in the database, attributed to nobody, and one "replace"
// button would hide how much that loses.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth";
import { playerSlug } from "@/lib/slug";
import { formatRole } from "@/lib/roles";
import { TEAM_ROLES, type TeamRole } from "@/lib/team/types";
import {
  PLACEHOLDER_EMAIL_DOMAIN,
  backfillNewAccount,
  deleteAvatar,
  readPlatform,
  resolveAccount,
  revalidateRoster,
  uploadAvatar,
} from "@/lib/settings/helpers";

import type { PlayerFormState } from "../form-state";


/**
 * Adds the person now playing a position.
 *
 * Since migration 028 the roster is five seats and every seat is full, so this
 * is only reachable *after* `deletePlayer` has freed one — replacing somebody is
 * two deliberate steps rather than one form that quietly grows the team. The
 * position is required for the same reason: `players.team_role` is `not null`,
 * and a form that omitted it would fail at the database with a constraint name
 * instead of a sentence.
 */
export async function addPlayer(
  _prevState: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  try {
    const { supabase } = await requireSession();

    const gameName = (formData.get("gameName") as string)?.trim();
    const tagLine = (formData.get("tagLine") as string)?.trim();
    const displayName = (formData.get("displayName") as string)?.trim();
    const teamRole = (formData.get("teamRole") as string)?.trim();
    const platform = readPlatform(formData);
    const avatarFile = formData.get("avatar") as File | null;

    if (!gameName || !tagLine || !displayName) {
      return { error: "Game name, tag line, and display name are required." };
    }
    if (!TEAM_ROLES.includes(teamRole as TeamRole)) {
      return { error: "Pick the position this player fills." };
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
        team_role: teamRole,
      })
      .select("id")
      .single();

    // Two different 23505s reach here and they need different answers: the
    // display name is unique, and so is the position. Telling somebody their
    // name is taken when the real problem is that mid is occupied would send
    // them to fix the wrong field.
    if (insertError || !created) {
      return {
        error:
          insertError?.code !== "23505"
            ? (insertError?.message ?? "Could not add the player.")
            : insertError.message?.includes("team_role")
              ? `${formatRole(teamRole)} is already taken. Remove that player first — the roster is five seats.`
              : "This player's display name is already taken.",
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
 * Moves a player to a position, swapping with whoever held it.
 *
 * Since migration 028 `players.team_role` is `not null` and unique: the table is
 * the team, five rows, one per position. So there is no "take them off the team"
 * and no "two people at mid" — the only edit the schema permits is an exchange.
 *
 * Two `update`s from here would fail on the first one. A non-deferred unique
 * constraint is checked per row, so the moment the incoming player is written
 * into a seat the outgoing player has not yet left, that is a duplicate. The
 * swap therefore happens inside `swap_team_roles` (migration 028), which defers
 * the constraint to the end of its own transaction — the one thing PostgREST
 * cannot express, because it has no way to send two statements as one.
 *
 * It is deliberately not `track_flex`, which lives on an account and answers a
 * different question — "is this account worth spending Riot calls walking for
 * queue 440". Unticking a sync checkbox should never redefine anybody's seat.
 */
export async function setTeamRole(playerId: string, role: string): Promise<void> {
  const { supabase } = await requireSession();

  // Validated here rather than trusted from the client, even though the check
  // constraint would also catch it: a constraint violation surfaces as a
  // Postgres error string in a toast, which is a worse answer than a sentence.
  if (!TEAM_ROLES.includes(role as TeamRole)) {
    throw new Error(`"${role}" is not one of the five positions.`);
  }

  const { error } = await supabase.rpc("swap_team_roles", {
    mover: playerId,
    target_role: role,
  });
  if (error) throw new Error(error.message);

  revalidateRoster();
  // The team section is the whole point of this column, and none of its pages
  // is covered by revalidateRoster's list.
  revalidatePath("/", "layout");
}

/**
 * Removes a player, freeing their position.
 *
 * The roster is five seats and all five are full, so this is the first half of
 * replacing somebody — `addPlayer` cannot run until a seat is free. Deliberately
 * two steps: everything that person played stays in the database, attributed to
 * nobody (`match_participants.player_id` and `team_picks.player_id` are both
 * `on delete set null`), and a single "replace" button would hide how much that
 * loses.
 */
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
  revalidatePath("/");
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
