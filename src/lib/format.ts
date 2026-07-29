export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);

  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let value = diffSec;
  for (const [size, unit] of units) {
    if (Math.abs(value) < size) {
      const rounded = Math.round(value);
      return rounded <= 0 ? "just now" : `${rounded} ${unit}${rounded === 1 ? "" : "s"} ago`;
    }
    value /= size;
  }
  return "a while ago";
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

export function formatPerMinute(total: number, gameDurationSeconds: number): string {
  if (gameDurationSeconds <= 0) return "0.0";
  return (total / (gameDurationSeconds / 60)).toFixed(1);
}

export function formatKillParticipation(kills: number, assists: number, teamKills: number): string {
  if (teamKills <= 0) return "0%";
  return `${Math.round(((kills + assists) / teamKills) * 100)}%`;
}
