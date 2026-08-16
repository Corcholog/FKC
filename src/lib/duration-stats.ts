// Whether the game running long is good news for this player, or bad.
//
// Every other per-player view in the app answers "how well do they play". This
// one answers "when". A 55% winrate that is 64% under 25 minutes and 41% past 35
// is a completely different player from a flat 55%, and the difference is the
// kind of thing a coach acts on — draft them a champion that closes, or stop
// giving them scaling picks.
//
// Two readings of the same rows, because they fail differently:
//
//   Buckets answer "how do they do in games of roughly this length". Clean, but
//   the long bucket is always the thinnest, and a 3-game bucket at 33% looks
//   like a finding when it's a coin landing badly.
//
//   The cumulative curve answers "given the game has reached minute X, how does
//   it end". Every point contains every longer game, so the sample shrinks
//   gradually instead of being sliced into thin cells, and the shape shows
//   *where* the decline starts rather than only that it exists.
//
// Nothing here needs a column the sync doesn't already store.

export type DurationStatInput = {
  win: boolean;
  game_duration_seconds: number;
};

export type DurationBucket = {
  key: string;
  label: string;
  /** Inclusive. */
  minSeconds: number;
  /** Exclusive. Null on the open-ended last bucket. */
  maxSeconds: number | null;
};

// The floor is 15:00 rather than 0 because migration 007 deleted the participant
// rows of every match under 900 seconds — remakes and stomps distort per-minute
// rates badly enough that they don't feed any stat. So there is no shorter
// bucket to build; the data starts here.
export const DURATION_BUCKETS: DurationBucket[] = [
  { key: "15-25", label: "15–25 min", minSeconds: 900, maxSeconds: 1500 },
  { key: "25-30", label: "25–30 min", minSeconds: 1500, maxSeconds: 1800 },
  { key: "30-35", label: "30–35 min", minSeconds: 1800, maxSeconds: 2100 },
  { key: "35+", label: "35+ min", minSeconds: 2100, maxSeconds: null },
];

export type DurationBucketAgg = {
  key: string;
  label: string;
  games: number;
  wins: number;
};

function bucketFor(seconds: number): DurationBucket | null {
  return (
    DURATION_BUCKETS.find(
      (b) => seconds >= b.minSeconds && (b.maxSeconds === null || seconds < b.maxSeconds),
    ) ?? null
  );
}

/**
 * Every bucket, in order, including empty ones.
 *
 * Empty buckets are kept rather than filtered: a player with nothing past 35
 * minutes is itself the finding, and dropping the row would render that as if
 * the question had never been asked.
 */
export function aggregateByDuration(rows: DurationStatInput[]): DurationBucketAgg[] {
  const byKey = new Map<string, DurationBucketAgg>(
    DURATION_BUCKETS.map((b) => [b.key, { key: b.key, label: b.label, games: 0, wins: 0 }]),
  );

  for (const row of rows) {
    const bucket = bucketFor(row.game_duration_seconds);
    if (!bucket) continue;

    const agg = byKey.get(bucket.key)!;
    agg.games += 1;
    if (row.win) agg.wins += 1;
  }

  return DURATION_BUCKETS.map((b) => byKey.get(b.key)!);
}

/** Minute marks the cumulative curve is sampled at. */
export const SURVIVAL_MARKS_MINUTES = [15, 20, 25, 30, 35, 40];

/**
 * Below this a point is drawn but flagged, not trusted. Same convention as
 * MIN_MATCHUP_GAMES and MIN_DUO_GAMES elsewhere: show the row, don't rank it.
 */
export const MIN_DURATION_SAMPLE = 5;

export type SurvivalPoint = {
  minute: number;
  /** Games that lasted at least this long. */
  games: number;
  wins: number;
  winRate: number;
  /** False when `games` is under MIN_DURATION_SAMPLE — render it, don't read it. */
  reliable: boolean;
};

/**
 * Winrate among the games that reached each mark.
 *
 * Read it as a conditional: "once this game has gone past 30 minutes, they win
 * 43% of the time". The 15-minute point is every stored game, so it equals the
 * player's overall winrate — which makes it a free self-check on the whole
 * pipeline, and the reason the marks start there.
 *
 * A mark that no game reached is dropped entirely rather than plotted at zero,
 * which would draw a cliff to the floor that means "no data" and reads as "never
 * wins".
 */
export function winRatePastMinute(
  rows: DurationStatInput[],
  marks: number[] = SURVIVAL_MARKS_MINUTES,
): SurvivalPoint[] {
  const points: SurvivalPoint[] = [];

  for (const minute of marks) {
    const threshold = minute * 60;
    let games = 0;
    let wins = 0;

    for (const row of rows) {
      if (row.game_duration_seconds < threshold) continue;
      games += 1;
      if (row.win) wins += 1;
    }

    if (games === 0) continue;

    points.push({
      minute,
      games,
      wins,
      winRate: Math.round((wins / games) * 100),
      reliable: games >= MIN_DURATION_SAMPLE,
    });
  }

  return points;
}

export function durationWinRate(agg: DurationBucketAgg): number {
  return agg.games === 0 ? 0 : Math.round((agg.wins / agg.games) * 100);
}

export type DurationSwing = {
  /** Winrate points gained (positive) or lost (negative) across the range below. */
  delta: number;
  fromMinute: number;
  toMinute: number;
};

/**
 * The headline the chart is there to support: how much winrate moves as games
 * run longer.
 *
 * Measured between the first and last marks that carry a real sample, and it
 * reports which ones those were. Both halves matter. Unreliable points are
 * excluded because the failure mode of this stat is announcing a 30-point
 * collapse that is three games against forty — and the tail is always the thin
 * end, so the naive version reports that collapse almost every time. Naming the
 * range matters for the same reason: a real history often runs out of sample at
 * 30 minutes, and calling that "the longest games" would describe a number the
 * reader can't find on the chart.
 *
 * Null when fewer than two marks qualify.
 */
export function durationSwing(points: SurvivalPoint[]): DurationSwing | null {
  const usable = points.filter((p) => p.reliable);
  if (usable.length < 2) return null;

  const first = usable[0];
  const last = usable[usable.length - 1];

  return {
    delta: last.winRate - first.winRate,
    fromMinute: first.minute,
    toMinute: last.minute,
  };
}
