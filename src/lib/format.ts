// One ladder, two renderings. The long form reads as prose ("3 hours ago") and
// the short one as a column ("3h"); keeping the thresholds in a single table is
// what stops the same instant rounding to a different unit in the two places.
//
// `short` is not an abbreviation of `long` — "mo" for month exists because "m"
// is already minutes, and a match list is one of the few places both can appear.
const TIME_UNITS: { size: number; long: string; short: string }[] = [
  { size: 60, long: "second", short: "s" },
  { size: 60, long: "minute", short: "m" },
  { size: 24, long: "hour", short: "h" },
  { size: 7, long: "day", short: "d" },
  { size: 4.345, long: "week", short: "w" },
  { size: 12, long: "month", short: "mo" },
  { size: Number.POSITIVE_INFINITY, long: "year", short: "y" },
];

export function formatRelativeTime(iso: string): string {
  let value = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  for (const { size, long } of TIME_UNITS) {
    if (Math.abs(value) < size) {
      const rounded = Math.round(value);
      return rounded <= 0 ? "just now" : `${rounded} ${long}${rounded === 1 ? "" : "s"} ago`;
    }
    value /= size;
  }
  return "a while ago";
}

/**
 * The same instant as a column value: "3h", "2d", "5mo".
 *
 * For places where the timestamp is one field in a dense row rather than a
 * sentence — a match list, where the long form is most of the width of the
 * column it sits in and none of the meaning.
 */
export function formatRelativeTimeShort(iso: string): string {
  let value = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  for (const { size, short } of TIME_UNITS) {
    if (Math.abs(value) < size) {
      const rounded = Math.round(value);
      return rounded <= 0 ? "now" : `${rounded}${short}`;
    }
    value /= size;
  }
  return "old";
}

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatKDA(kills: number, deaths: number, assists: number): string {
  return `${kills} / ${deaths} / ${assists}`;
}

// The (K+A)/D ratio as a display string — distinct from formatKDA above, which
// renders the raw "k / d / a" triple.
export function formatKdaRatio(ratio: number): string {
  return ratio.toFixed(2);
}

// (K+A)/D for a single game, same deathless convention as the lifetime
// aggregate in player-stats.ts — folded in next to the raw "k / d / a" triple
// so nobody has to do the division by hand.
export function kdaRatioForGame(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(deaths, 1);
}

export function formatPerMinute(total: number, gameDurationSeconds: number): string {
  if (gameDurationSeconds <= 0) return "0.0";
  return (total / (gameDurationSeconds / 60)).toFixed(1);
}

export function formatKillParticipation(kills: number, assists: number, teamKills: number): string {
  if (teamKills <= 0) return "0%";
  return `${Math.round(((kills + assists) / teamKills) * 100)}%`;
}
