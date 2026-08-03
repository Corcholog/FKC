// Discord webhook transport.
//
// This exists for observability first and the daily recap second. Before it,
// the entire operational story was one database row (`sync_state`) plus a
// banner — so a cron that failed at 07:00 stayed unnoticed until somebody
// happened to open Settings and read `last_error`. See
// docs/engineering/10-known-gaps.md §5.
//
// The one hard rule in this file: **nothing here ever throws.** A webhook is a
// notification channel, not a dependency. If Discord is down, or the URL is
// unset, or the payload is malformed, the sync that triggered the message must
// still finish and still report its own result truthfully. Every export returns
// void and swallows its own failures into console.error.

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Discord truncates embed descriptions at 4096 and rejects the whole request
// over the limit, so a long AI recap has to be cut here rather than 400'd there.
const MAX_DESCRIPTION = 4000;

/** Embed accent colours, as the decimal ints Discord's API expects. */
const COLORS = {
  danger: 0xe5484d,
  warning: 0xe8a020,
  win: 0x3fbf6f,
  loss: 0xe2504a,
  gold: 0xc89b3c,
} as const;

export type EmbedColor = keyof typeof COLORS;

type Embed = {
  title: string;
  description?: string;
  color: number;
  timestamp: string;
};

export function isDiscordConfigured(): boolean {
  return !!WEBHOOK_URL;
}

async function post(embed: Embed): Promise<void> {
  if (!WEBHOOK_URL) return;

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      // A hung webhook must not eat the cron's remaining budget.
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Read the body: Discord explains malformed embeds in it, and a silent
      // 400 here would be its own invisible failure — the exact thing this
      // module exists to stop.
      console.error(`Discord webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (e) {
    console.error("Discord webhook failed:", e);
  }
}

function truncate(text: string): string {
  return text.length <= MAX_DESCRIPTION ? text : `${text.slice(0, MAX_DESCRIPTION - 1)}…`;
}

/**
 * Send a notification. Fire-and-forget by contract — callers should not need to
 * handle a rejection, because there isn't one.
 */
export async function notifyDiscord(
  title: string,
  description: string,
  color: EmbedColor = "gold",
): Promise<void> {
  await post({
    title,
    description: truncate(description),
    color: COLORS[color],
    timestamp: new Date().toISOString(),
  });
}
