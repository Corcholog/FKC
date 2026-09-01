// The private half of the settings actions.
//
// A `"use server"` module may only export async functions, so the moment
// settings/actions.ts split into four files its shared helpers had nowhere to
// live: `revalidateRoster` is not async, `PLACEHOLDER_EMAIL_DOMAIN` is not a
// function, and re-exporting either from an action module is a build error. That
// is the whole reason the split kept being deferred (10-known-gaps §7b).
//
// A plain module solves it. Nothing here is a server action; every one of these
// is called *by* one, after that action has run `requireSession()`.
//
// **Nothing in this file authorises anything.** Several of these hold the admin
// client, which bypasses RLS — `getRiotApiKey` reads a column the authenticated
// role deliberately cannot see, and `uploadAvatar` writes to a public bucket. A
// caller that forgot its session check would be a privilege hole, so every
// export here is written on the assumption that the check already happened.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPuuidByRiotId,
  describeRiotError,
  DEFAULT_PLATFORM,
  SUPPORTED_PLATFORMS,
} from "@/lib/riot";
import { backfillAccountHistory, RiotKeyInvalidError } from "@/lib/sync";


// Admin client, not the caller's session: since migration 011 the authenticated
// role has no grant on sync_state.riot_api_key, so a session client reading this
// gets a permission error rather than the key. The gate is requireSession() in
// each caller — this function is only ever reached from an authed action.
export async function getRiotApiKey() {
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

export function avatarPathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = "/avatars/";
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

export async function uploadAvatar(file: File, playerId: string): Promise<string> {
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

export async function deleteAvatar(url: string | null) {
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
export async function resolveAccount(
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

export function readPlatform(formData: FormData): string {
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
export async function backfillNewAccount(puuid: string, label: string): Promise<string> {
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

export function revalidateRoster() {
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/players");
  revalidatePath("/players/[slug]", "page");
}

export const PLACEHOLDER_EMAIL_DOMAIN = "player.invalid";
