import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { runSync, RiotKeyInvalidError } from "@/lib/sync";
import { notifyDiscord } from "@/lib/discord";
import { championDisplayName, getChampionMap, getLatestVersion } from "@/lib/ddragon";

// Riot's 100 req/2min ceiling puts a hard floor of ~1.2s on every call once the
// burst allowance is spent, so a sync across every tracked player is genuinely
// slow. Without this, non-Fluid-Compute Vercel deployments default to a 10-15s
// budget (60s hard cap on Hobby). runSync keeps its own SYNC_BUDGET_MS below
// this and stops cleanly rather than being killed mid-run.
export const maxDuration = 60;

// A run stuck at 'running' past this is assumed crashed, not actually in progress.
const STALE_RUN_MS = 10 * 60 * 1000;

async function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

async function handleSync(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Atomic claim: only proceed if the row isn't currently 'running', or if it
  // is but has been for longer than STALE_RUN_MS (a crashed previous run).
  // A plain read-then-write here would race under concurrent requests —
  // Postgres serializes concurrent UPDATEs on the same row, so this doesn't.
  const staleThreshold = new Date(Date.now() - STALE_RUN_MS).toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("sync_state")
    .update({ last_sync_status: "running", last_sync_started_at: new Date().toISOString() })
    .eq("id", 1)
    // last_sync_status starts NULL on a fresh install — `neq.running` alone
    // would not match NULL under SQL's three-valued logic, so it's listed explicitly.
    .or(`last_sync_status.is.null,last_sync_status.neq.running,last_sync_started_at.lt.${staleThreshold}`)
    .select("id");

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "Sync already running" }, { status: 409 });
  }

  try {
    const summary = await runSync(admin);

    await admin
      .from("sync_state")
      .update({
        last_sync_status: "success",
        last_sync_finished_at: new Date().toISOString(),
        riot_key_valid: true,
        last_error: null,
      })
      .eq("id", 1);

    // After the status write, not before: the database record of the run is
    // what the app reads, and it must not wait on an external service.
    // notifyDiscord never throws, so this can't turn a good sync into a 500.
    //
    // Multikills first — a penta is the single most postworthy thing that
    // happens in this game, and burying it under a list of LP movements gets it
    // read second.
    if (summary.multikills.length > 0) {
      // Riot stores the codename ("MonkeyKing"); only DDragon knows "Wukong".
      // Both calls are day-cached and both degrade to a null map rather than
      // throwing, in which case championDisplayName falls back to the codename
      // — an uglier message, never a missing one.
      const version = await getLatestVersion();
      const championMap = await getChampionMap(version);

      // Pentas before quadras regardless of sync order, so the better news
      // isn't pushed down the channel by a quadra found first.
      const ordered = [...summary.multikills].sort((a, b) =>
        a.kind === b.kind ? 0 : a.kind === "penta" ? -1 : 1,
      );

      for (const mk of ordered) {
        const champion = championDisplayName(mk.championId, championMap, mk.championName);
        const isPenta = mk.kind === "penta";
        const noun = isPenta ? "pentakill" : "quadrakill";

        await notifyDiscord(
          isPenta ? "⭐ PENTAKILL" : "⚔️ Quadrakill",
          mk.count > 1
            ? `**${mk.displayName}** got **${mk.count} ${noun}s** in one game on ${champion}.`
            : `**${mk.displayName}** got a ${noun} on ${champion}.`,
          isPenta ? "gold" : "win",
        );
      }
    }

    for (const change of summary.rankChanges) {
      await notifyDiscord(
        change.promoted ? `⬆️ ${change.displayName} promoted` : `⬇️ ${change.displayName} demoted`,
        `${change.from} → **${change.to}**`,
        change.promoted ? "win" : "loss",
      );
    }

    return NextResponse.json({ status: "success", ...summary });
  } catch (e) {
    const isKeyInvalid = e instanceof RiotKeyInvalidError;
    const message = e instanceof Error ? e.message : "Unknown sync error";

    await admin
      .from("sync_state")
      .update({
        last_sync_status: "error",
        last_sync_finished_at: new Date().toISOString(),
        riot_key_valid: !isKeyInvalid,
        last_error: message,
      })
      .eq("id", 1);

    // The reason this webhook exists. A cron failing at 07:00 previously wrote
    // last_error and stopped there — the only way to find out was to open
    // Settings and look, which nobody does on a morning when nothing seems
    // wrong. An expired Riot key gets its own message because it's the one
    // failure with a known, routine fix (docs/engineering/08-operations.md §5).
    await notifyDiscord(
      isKeyInvalid ? "🔑 Riot API key expired" : "❌ Sync failed",
      isKeyInvalid
        ? "The daily key has expired. Regenerate it at developer.riotgames.com, paste it into Settings, then press Sync."
        : `\`\`\`\n${message}\n\`\`\``,
      isKeyInvalid ? "warning" : "danger",
    );

    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}
