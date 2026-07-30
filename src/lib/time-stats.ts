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

export type HourWeekdayStats = {
  /** [weekday 0=Mon..6=Sun][hour 0..23] */
  grid: TimeBucket[][];
  byHour: TimeBucket[];
  byWeekday: TimeBucket[];
  totalGames: number;
};

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

// Intl is the only way to get a wall-clock hour in a fixed zone without pulling
// in a date library — Date's own getters are always UTC or the host's zone.
const PARTS_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: ROSTER_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  hour12: false,
});

function localParts(iso: string): { weekday: number; hour: number } | null {
  const parts = PARTS_FORMAT.formatToParts(new Date(iso));
  const weekday = WEEKDAY_INDEX[parts.find((p) => p.type === "weekday")?.value ?? ""];
  const hourRaw = parts.find((p) => p.type === "hour")?.value;
  if (weekday === undefined || hourRaw === undefined) return null;

  // hour12: false still renders midnight as "24" in some ICU versions.
  const hour = Number(hourRaw) % 24;
  return Number.isNaN(hour) ? null : { weekday, hour };
}

const emptyBucket = (): TimeBucket => ({ games: 0, wins: 0 });

export function aggregateByTime(rows: TimeStatInput[]): HourWeekdayStats {
  const grid = WEEKDAY_LABELS.map(() => Array.from({ length: 24 }, emptyBucket));
  const byHour = Array.from({ length: 24 }, emptyBucket);
  const byWeekday = WEEKDAY_LABELS.map(emptyBucket);
  let totalGames = 0;

  for (const row of rows) {
    const parts = localParts(row.game_creation);
    if (!parts) continue;

    for (const bucket of [grid[parts.weekday][parts.hour], byHour[parts.hour], byWeekday[parts.weekday]]) {
      bucket.games += 1;
      if (row.win) bucket.wins += 1;
    }
    totalGames += 1;
  }

  return { grid, byHour, byWeekday, totalGames };
}

export function bucketWinRate(bucket: TimeBucket): number | null {
  return bucket.games === 0 ? null : Math.round((bucket.wins / bucket.games) * 100);
}

// Games started between these hours (local). Not a scientific cutoff — it's the
// window where "one more game" stops being a good idea.
const LATE_NIGHT_FROM = 0;
const LATE_NIGHT_TO = 6;

export function lateNightRecord(stats: HourWeekdayStats): TimeBucket {
  const total = emptyBucket();
  for (let hour = LATE_NIGHT_FROM; hour < LATE_NIGHT_TO; hour += 1) {
    total.games += stats.byHour[hour].games;
    total.wins += stats.byHour[hour].wins;
  }
  return total;
}

export function busiestHour(stats: HourWeekdayStats): number | null {
  let best: number | null = null;
  stats.byHour.forEach((bucket, hour) => {
    if (bucket.games > 0 && (best === null || bucket.games > stats.byHour[best].games)) best = hour;
  });
  return best;
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
