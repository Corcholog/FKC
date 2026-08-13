import { SlidingWindowLimiter, sleep } from "@/lib/rate-limiter";

// Match-V5 and Account-V1 use regional routing; League-V4 uses platform routing.
// See docs/04_RIOT_API_INTEGRATION.md §1.
const REGIONAL_BASE = "https://americas.api.riotgames.com";

const PLATFORM_BASES: Record<string, string> = {
  LA2: "https://la2.api.riotgames.com",
};

// docs/04_RIOT_API_INTEGRATION.md §5: 20 req/s and 100 req/2min on a personal
// key. Both are shaved slightly — our clock starts the window when we send,
// Riot's when it receives, and that gap is exactly where an off-by-one 429
// comes from.
const RIOT_LIMIT_WINDOWS = [
  { limit: 18, intervalMs: 1_000 },
  { limit: 96, intervalMs: 120_000 },
];

// Module-level, so every caller in a given serverless instance shares the same
// budget — the sync loop, the settings backfill and an ad-hoc Riot ID lookup
// all count against the same key.
export const riotLimiter = new SlidingWindowLimiter(RIOT_LIMIT_WINDOWS);

const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RETRY_AFTER_MS = 10_000;

export class RiotApiError extends Error {
  status: number;
  /**
   * Riot's own error text, e.g. "Bad Request - Unknown apikey". Null when the
   * body wasn't the usual JSON envelope.
   *
   * Carried separately from `message` because it's the only thing that tells
   * two very different 400s apart — see isRiotKeyRejection below.
   */
  riotMessage: string | null;

  constructor(status: number, message: string, riotMessage: string | null = null) {
    super(message);
    this.status = status;
    this.riotMessage = riotMessage;
  }
}

// Riot returns {"status":{"message":"...","status_code":N}} on error. Guarded
// because a gateway-level failure can return HTML, and a parse error here would
// mask the real status code.
async function readRiotMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { status?: { message?: string } };
    return body?.status?.message ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether an error means "the key is the problem" — the one Riot failure with a
 * routine fix (regenerate at developer.riotgames.com, paste into Settings).
 *
 * 401 and 403 are unambiguous. **400 is not**, and the distinction matters more
 * than it looks, because Riot answers every *key* problem with 401 — measured
 * against account-v1 on 2026-08-13:
 *
 *   malformed key      -> 401 "Forbidden"
 *   empty header       -> 401 "Cannot process request apikey or authorization
 *                              header is empty"
 *   unknown RGAPI key  -> 401 "Unknown apikey"
 *
 * Auth is therefore evaluated before the request is parsed, which means **a 400
 * is proof the key authenticated.** It is a malformed request — most often
 * "Exception decrypting <puuid>" from match-v5 against a stored puuid.
 *
 * The apikey check below is kept only as a narrow safety net for the 400
 * "unknown apikey" reports in developer-relations#1054. It requires an explicit
 * mention of the key, so it cannot swallow a decrypt failure and send someone
 * off to refresh a key that was never the problem.
 */
export function isRiotKeyRejection(e: unknown): boolean {
  if (!(e instanceof RiotApiError)) return false;
  if (e.status === 401 || e.status === 403) return true;
  if (e.status !== 400) return false;
  return /api\s?key/i.test(e.riotMessage ?? "");
}

// Every Riot call goes through here, so this is the one place pacing and 429
// recovery need to live. Callers must not add their own delays.
async function riotFetch(url: string, apiKey: string) {
  for (let attempt = 0; ; attempt += 1) {
    await riotLimiter.acquire();

    const res = await fetch(url, { headers: { "X-Riot-Token": apiKey } });
    if (res.ok) return res.json();

    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      // Retry-After is in whole seconds. It's absent on the rare service-level
      // 429, hence the fallback.
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : DEFAULT_RETRY_AFTER_MS;

      riotLimiter.notifyRateLimited(waitMs);
      await sleep(waitMs);
      continue;
    }

    if (res.status === 429) {
      // X-Rate-Limit-Type distinguishes our own overuse ("application") from a
      // per-endpoint or Riot-side cap — worth carrying into the error, since
      // they call for completely different fixes.
      const limitType = res.headers.get("x-rate-limit-type") ?? "unknown";
      throw new RiotApiError(
        429,
        `Riot API rate limit hit (type: ${limitType}) and still limited after ${MAX_RATE_LIMIT_RETRIES} retries for ${url}`,
      );
    }

    // Riot's own text goes into the message as well as the field: this string
    // is what lands in sync_state.last_error and in the Discord alert, and
    // "(400)" alone sends whoever reads it looking in the wrong place.
    const riotMessage = await readRiotMessage(res);
    throw new RiotApiError(
      res.status,
      `Riot API request failed (${res.status}${riotMessage ? `: ${riotMessage}` : ""}) for ${url}`,
      riotMessage,
    );
  }
}

export async function getPuuidByRiotId(gameName: string, tagLine: string, apiKey: string) {
  const url = `${REGIONAL_BASE}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const data = (await riotFetch(url, apiKey)) as { puuid: string };
  return data.puuid;
}

export async function getRankedSoloMatchIds(
  puuid: string,
  apiKey: string,
  { start = 0, count = 20 }: { start?: number; count?: number } = {},
) {
  const url = `${REGIONAL_BASE}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&start=${start}&count=${count}`;
  return (await riotFetch(url, apiKey)) as string[];
}

export type MatchParticipantDto = {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  teamId: number;
  teamPosition?: string; // TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY, "" if Riot couldn't determine it
  championId: number;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalDamageDealtToChampions: number;
  goldEarned: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  gameEndedInEarlySurrender: boolean;

  // Everything below has always been in the response and was simply parsed
  // away — see docs/migrations/005_participant_detail_columns.sql. All optional
  // because Riot has quietly added and removed participant fields across
  // patches, and a missing one should mean a null column, not a crash.
  visionScore?: number;
  wardsPlaced?: number;
  wardsKilled?: number;
  detectorWardsPlaced?: number;

  totalDamageTaken?: number;
  damageSelfMitigated?: number;
  totalHealsOnTeammates?: number;
  totalDamageShieldedOnTeammates?: number;
  timeCCingOthers?: number;

  turretTakedowns?: number;
  dragonTakedowns?: number;
  baronTakedowns?: number;
  inhibitorTakedowns?: number;
  objectivesStolen?: number;

  firstBloodKill?: boolean;
  firstBloodAssist?: boolean;
  doubleKills?: number;
  tripleKills?: number;
  quadraKills?: number;
  pentaKills?: number;

  totalTimeSpentDead?: number;
  longestTimeSpentLiving?: number;

  champLevel?: number;
  item0?: number;
  item1?: number;
  item2?: number;
  item3?: number;
  item4?: number;
  item5?: number;
  item6?: number;
  summoner1Id?: number;
  summoner2Id?: number;

  challenges?: Record<string, number | boolean | undefined>;
} & Partial<Record<PingField, number>>;

// Riot's ping counters. They've come and gone between patches (dangerPings was
// removed once already), so these are read opportunistically into a jsonb blob
// rather than promoted to columns.
export const PING_FIELDS = [
  "allInPings",
  "assistMePings",
  "basicPings",
  "commandPings",
  "dangerPings",
  "enemyMissingPings",
  "enemyVisionPings",
  "getBackPings",
  "holdPings",
  "needVisionPings",
  "onMyWayPings",
  "pushPings",
  "visionClearedPings",
] as const;

export type PingField = (typeof PING_FIELDS)[number];

// The slice of `challenges` worth keeping. The full object is 100+ keys and
// ~2-3KB per participant (so ~30KB per match), which would dwarf everything
// else in the database for stats nobody asked for. Add to this list rather than
// storing the blob.
export const CHALLENGE_KEYS = [
  "soloKills",
  "killParticipation",
  "skillshotsDodged",
  "skillshotsHit",
  "laneMinionsFirst10Minutes",
  "maxCsAdvantageOnLaneOpponent",
  "enemyChampionImmobilizations",
  "saveAllyFromDeath",
  "hadAfkTeammate",
  "bountyGold",
  "takedownsFirstXMinutes",
  "turretPlatesTaken",
  "visionScorePerMinute",
] as const;

export type MatchDto = {
  info: {
    queueId: number;
    gameCreation: number;
    gameDuration: number;
    gameVersion: string;
    participants: MatchParticipantDto[];
  };
};

export async function getMatchById(matchId: string, apiKey: string) {
  const url = `${REGIONAL_BASE}/lol/match/v5/matches/${matchId}`;
  return (await riotFetch(url, apiKey)) as MatchDto;
}

export type LeagueEntryDto = {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
};

export async function getRankedSoloEntry(puuid: string, platform: string, apiKey: string) {
  const base = PLATFORM_BASES[platform] ?? PLATFORM_BASES.LA2;
  const url = `${base}/lol/league/v4/entries/by-puuid/${puuid}`;
  const entries = (await riotFetch(url, apiKey)) as LeagueEntryDto[];
  return entries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? null;
}

// Shared mapping from a caught RiotApiError to a message safe to show in the admin UI.
export function describeRiotError(e: unknown, gameName: string, tagLine: string): string {
  if (e instanceof RiotApiError) {
    if (isRiotKeyRejection(e)) {
      return "Riot API key is invalid or expired — update sync_state.riot_api_key in Supabase. A key generated in the last few minutes can also be rejected until Riot propagates it.";
    }
    if (e.status === 404) {
      return `No Riot account found for ${gameName}#${tagLine}.`;
    }
    // A 400 that isn't about the key is a malformed request, and retrying it
    // unchanged will fail identically — so don't suggest trying again.
    if (e.status === 400) {
      return `Riot rejected the request${e.riotMessage ? `: ${e.riotMessage}` : " (400)"}.`;
    }
    return `Riot API error (${e.status}). Try again in a moment.`;
  }
  return e instanceof Error ? e.message : "Riot API lookup failed.";
}
