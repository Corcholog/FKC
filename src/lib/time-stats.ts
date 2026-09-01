// When the games actually get played, and how that goes.
//
// Everything is bucketed in Buenos Aires time, not UTC and not the viewer's
// browser locale: the roster is on LAS and "games after midnight" has to mean
// midnight where they are, or the whole stat says nothing. This is the same
// timezone TRACKING_START_DATE is anchored to in src/lib/sync.ts.

export const ROSTER_TIME_ZONE = "America/Argentina/Buenos_Aires";

export type TimeStatInput = {
  win: boolean;
  game_creation: string;
};

export type TimeBucket = {
  games: number;
  wins: number;
};

/**
 * The day, in 24 buckets.
 *
 * It used to carry a [weekday][hour] grid and a per-weekday total as well, for a
 * 24×7 heatmap. That chart is gone (see components/charts/hour-bars.tsx), and
 * folding 168 buckets nobody reads over every row the roster has played is not
 * free on a page that folds them on every request.
 */
export type HourStats = {
  byHour: TimeBucket[];
  totalGames: number;
};

// Intl is the only way to get a wall-clock hour in a fixed zone without pulling
// in a date library — Date's own getters are always UTC or the host's zone.
const HOUR_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: ROSTER_TIME_ZONE,
  hour: "2-digit",
  hour12: false,
});

function localHour(iso: string): number | null {
  const raw = HOUR_FORMAT.formatToParts(new Date(iso)).find((p) => p.type === "hour")?.value;
  if (raw === undefined) return null;

  // hour12: false still renders midnight as "24" in some ICU versions.
  const hour = Number(raw) % 24;
  return Number.isNaN(hour) ? null : hour;
}

const emptyBucket = (): TimeBucket => ({ games: 0, wins: 0 });

export function aggregateByTime(rows: TimeStatInput[]): HourStats {
  const byHour = Array.from({ length: 24 }, emptyBucket);
  let totalGames = 0;

  for (const row of rows) {
    const hour = localHour(row.game_creation);
    if (hour === null) continue;

    byHour[hour].games += 1;
    if (row.win) byHour[hour].wins += 1;
    totalGames += 1;
  }

  return { byHour, totalGames };
}

export function bucketWinRate(bucket: TimeBucket): number | null {
  return bucket.games === 0 ? null : Math.round((bucket.wins / bucket.games) * 100);
}

// ------------------------------------------------------------
// Who is behind a cell.
//
// A bar's height is a total, and a total hides which two people are actually
// the ones queueing at 3am. These let one be clicked open into the players that
// built it — see StatRankingDialog.
// ------------------------------------------------------------

export type SlotOwnerInput = TimeStatInput & { player_id: string | null };

export type SlotRecord = { ownerId: string; games: number; wins: number };

/**
 * Who played in each hour of the day, most games first.
 *
 * Keyed by hour rather than by (weekday, hour): the chart above it is 24 bars,
 * not a 168-cell grid, and a breakdown finer than the thing it explains is a
 * breakdown nobody can reach.
 */
export function playersByHour(rows: SlotOwnerInput[]): Map<number, SlotRecord[]> {
  const byHour = new Map<number, Map<string, SlotRecord>>();

  for (const row of rows) {
    if (!row.player_id) continue;
    const hour = localHour(row.game_creation);
    if (hour === null) continue;

    const owners = byHour.get(hour) ?? new Map<string, SlotRecord>();
    const record = owners.get(row.player_id) ?? {
      ownerId: row.player_id,
      games: 0,
      wins: 0,
    };
    record.games += 1;
    if (row.win) record.wins += 1;
    owners.set(row.player_id, record);
    byHour.set(hour, owners);
  }

  return new Map(
    [...byHour.entries()].map(([hour, owners]) => [
      hour,
      [...owners.values()].sort((a, b) => b.games - a.games),
    ]),
  );
}

// Midnight to 06:00, Buenos Aires. The window the "after midnight" caption on
// the front page compares against the rest of the day.
const LATE_NIGHT_FROM = 0;
const LATE_NIGHT_TO = 6;

export function lateNightRecord(stats: HourStats): TimeBucket {
  const total = emptyBucket();
  for (let hour = LATE_NIGHT_FROM; hour < LATE_NIGHT_TO; hour += 1) {
    total.games += stats.byHour[hour].games;
    total.wins += stats.byHour[hour].wins;
  }
  return total;
}

export function busiestHour(stats: HourStats): number | null {
  let best: number | null = null;
  stats.byHour.forEach((bucket, hour) => {
    if (bucket.games > 0 && (best === null || bucket.games > stats.byHour[best].games)) best = hour;
  });
  return best;
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
