// The queue vocabulary: which Riot queues this app tracks, how far back each
// one goes, and where each one's sync cursor lives.
//
// One module rather than constants scattered across sync.ts and riot.ts,
// because the three facts about a queue are coupled — a queue id with no
// tracking start would be walked back to the account's first ever game, and a
// tracking start with no cursor column would be walked from scratch every run.
//
// Pure: no I/O, no Supabase, no React.

export const QUEUE_SOLO = 420;
export const QUEUE_FLEX = 440;

/** Which queue a `match_participants` / `matches` row belongs to. */
export type TrackedQueue = "solo" | "flex";

export const TRACKED_QUEUES: TrackedQueue[] = ["solo", "flex"];

export const QUEUE_ID: Record<TrackedQueue, number> = {
  solo: QUEUE_SOLO,
  flex: QUEUE_FLEX,
};

/**
 * Every queue id whose games are worth storing.
 *
 * The sync's exclusion rule tests membership of this rather than equality with
 * the queue it is currently walking, so a game the *other* queue's walk happens
 * to surface is kept and counted instead of being written off as off-queue.
 */
export const TRACKED_QUEUE_IDS: number[] = [QUEUE_SOLO, QUEUE_FLEX];

export function queueForId(queueId: number): TrackedQueue | null {
  if (queueId === QUEUE_SOLO) return "solo";
  if (queueId === QUEUE_FLEX) return "flex";
  return null;
}

/**
 * How far back each queue is tracked. Two dates, not one, and that asymmetry is
 * the whole reason the cursors are per-queue.
 *
 * SoloQ keeps the app's stated tracking start (docs/01_PRD.md §4.6) — it is a
 * product decision about what history the app claims to cover, not a ranked
 * reset. Flex starts in June, when the roster started playing it as a team.
 *
 * Both are expressed in UTC from America/Argentina/Buenos_Aires (UTC-3, no DST
 * since 2009) — the same zone TRACKING_START_DATE and time-stats.ts use, so
 * "since June" means June where the roster lives.
 */
export const TRACKING_START: Record<TrackedQueue, Date> = {
  // 2026-07-29 12:00 ART
  solo: new Date("2026-07-29T15:00:00Z"),
  // 2026-06-01 00:00 ART
  flex: new Date("2026-06-01T03:00:00Z"),
};

/** The `player_accounts` column holding this queue's contiguity cursor. */
export const CURSOR_COLUMN = {
  solo: "synced_through_solo",
  flex: "synced_through_flex",
} as const satisfies Record<TrackedQueue, string>;

/** The `player_accounts` flag saying whether this queue is worth walking for an account. */
export const TRACK_COLUMN = {
  solo: "track_solo",
  flex: "track_flex",
} as const satisfies Record<TrackedQueue, string>;

export const QUEUE_LABEL: Record<TrackedQueue, string> = {
  solo: "SoloQ",
  flex: "FlexQ",
};

/**
 * Parses the `?queues=` parameter on /api/sync.
 *
 * Anything unrecognised — including an empty string — falls back to every
 * tracked queue rather than to none: a typo in a cron URL that silently synced
 * nothing would look exactly like a working sync with a quiet day.
 */
export function parseQueues(raw: string | null | undefined): TrackedQueue[] {
  if (!raw) return [...TRACKED_QUEUES];
  const asked = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is TrackedQueue => TRACKED_QUEUES.includes(part as TrackedQueue));
  return asked.length > 0 ? [...new Set(asked)] : [...TRACKED_QUEUES];
}

