// Game length and map side, at team level.
//
// The pure modules from the player pages (lib/duration-stats.ts,
// lib/side-stats.ts) already answer both questions; this adapts scrim rows to
// their input shapes rather than reimplementing the folds. Two things make that
// adaptation worth a file of its own instead of a `.map()` at each call site:
//
//   1. `scrim_games.duration_seconds` is **nullable** — it is typed in by hand
//      and often skipped — and `scrim_games` has no 15-minute floor, unlike
//      soloq where migration 007 deleted everything shorter. Both cases would be
//      dropped silently by aggregateByDuration, so both are counted here and
//      reported by the view. A split over 40 games that quietly describes 26 is
//      the exact failure this codebase spends its comments avoiding.
//
//   2. Side means something different here. In soloq it is assigned, which is
//      why MIN_SIDE_GAMES is 100 and the caption calls it a curiosity. In a
//      scrim it comes out of a draft the team prepared for, and blue side picks
//      first — so the side record *is* the first-pick record, and it is
//      actionable at a sample a soloq page would refuse to read.

import {
  aggregateByDuration,
  durationSwing,
  winRatePastMinute,
  DURATION_BUCKETS,
  type DurationBucketAgg,
  type DurationSwing,
  type SurvivalPoint,
} from "@/lib/duration-stats";
import { toRecord, type ScrimRecord } from "@/lib/scrims/team-stats";
import { hadFirstPick, type ScrimGameView } from "@/lib/scrims/types";

/** The shortest game any bucket covers. Below it, aggregateByDuration has no home for a row. */
const SHORTEST_BUCKET_SECONDS = DURATION_BUCKETS[0].minSeconds;

export type ScrimDurationSplit = {
  buckets: DurationBucketAgg[];
  curve: SurvivalPoint[];
  swing: DurationSwing | null;
  /** Games that fed the split. */
  counted: number;
  /** Games whose duration was never typed in. */
  untimed: number;
  /** Games shorter than the first bucket — real in scrims, impossible in soloq. */
  tooShort: number;
};

export function scrimDurationSplit(games: ScrimGameView[]): ScrimDurationSplit {
  const rows: Array<{ win: boolean; game_duration_seconds: number }> = [];
  let untimed = 0;
  let tooShort = 0;

  for (const game of games) {
    if (game.duration_seconds === null) {
      untimed += 1;
      continue;
    }
    if (game.duration_seconds < SHORTEST_BUCKET_SECONDS) {
      tooShort += 1;
      continue;
    }
    rows.push({ win: game.win, game_duration_seconds: game.duration_seconds });
  }

  const curve = winRatePastMinute(rows);

  return {
    buckets: aggregateByDuration(rows),
    curve,
    swing: durationSwing(curve),
    counted: rows.length,
    untimed,
    tooShort,
  };
}

export type FirstPickSplit = {
  /** Blue side: we picked first. */
  first: ScrimRecord;
  /** Red side: we picked second, and had last pick in each round. */
  second: ScrimRecord;
};

/**
 * The side record, named for what it means rather than for its colour.
 *
 * `recordBySide` in team-stats.ts already answers the same question and the
 * overview renders it as blue/red, which is right there — that page is a
 * summary of games. On a page about preparation the useful framing is draft
 * order, because that is the thing a coach can plan around and the thing a
 * bracket sometimes hands you.
 */
export function firstPickSplit(games: ScrimGameView[]): FirstPickSplit {
  let firstGames = 0;
  let firstWins = 0;
  let secondGames = 0;
  let secondWins = 0;

  for (const game of games) {
    if (hadFirstPick(game)) {
      firstGames += 1;
      if (game.win) firstWins += 1;
    } else {
      secondGames += 1;
      if (game.win) secondWins += 1;
    }
  }

  return {
    first: toRecord(firstGames, firstWins),
    second: toRecord(secondGames, secondWins),
  };
}
