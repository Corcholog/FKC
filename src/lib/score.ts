// Performance score: one 0-100 number for what a player did in one game.
//
// Ported from the sibling FKC tracker's `calculateScoreV3`, which is the best
// idea in that codebase. The shape of it is unchanged — five weighted parts,
// summed and clamped — but two of its inputs are not stored here and had to be
// substituted, and the null handling is this repo's rather than that one's.
//
// Why a score at all: every other number on a player page answers "how much",
// and none of them answer "was that good". 8/2/11 is a different game on a
// support than on a mid, and a 40-minute game is a different game from a
// 22-minute one. The parts below normalise for both, mostly by comparing a
// player against the nine other people who were actually there rather than
// against a constant.
//
// Pure: no I/O, no React, no Supabase — same as every other module in this
// directory. The scoring pass needs all ten rows of a match at once (team
// totals, and the opposite laner), so the entry point takes the whole match.

import { SUPPORT_POSITION } from "@/lib/roles";

/**
 * The columns the formula reads, named as they are in `match_participants`.
 *
 * Structural, like every other *Input type in this directory, so a caller can
 * select one superset of columns and hand the same array to several modules.
 */
export type ScoreInput = {
  team_id: number;
  team_position: string | null;

  kills: number;
  deaths: number;
  assists: number;
  damage_dealt_to_champions: number;
  gold_earned: number;
  total_minions_killed: number;
  neutral_minions_killed: number;

  // Migration 005's detail set. All nullable: rows synced before it existed
  // hold NULLs until the settings "Re-fetch match details" action backfills
  // them, and Riot has quietly dropped participant fields between patches.
  // Only the three in DETAIL_COLUMNS below are required — see the note there on
  // dragon/baron, which Riot never fills at this path.
  vision_score: number | null;
  total_damage_taken: number | null;
  detector_wards_placed: number | null;
  turret_takedowns: number | null;
  dragon_takedowns: number | null;
  baron_takedowns: number | null;
  inhibitor_takedowns: number | null;
  objectives_stolen: number | null;
};

/**
 * How the five parts are weighted. They sum to 1, and the comments are the
 * argument for each share rather than a restatement of the number.
 */
const WEIGHTS = {
  /** Damage, farm, gold and vision per minute against this lobby's own average. */
  global: 0.35,
  /** The same, against the one person playing the same role on the other team. */
  vsOpponent: 0.25,
  /** Share of the team's kills, damage and damage taken. */
  teamImpact: 0.18,
  /** The part of the job that is specific to the role. */
  role: 0.12,
  /** Turrets, dragons, barons, inhibitors, steals. */
  objectives: 0.1,
} as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const safeDiv = (numerator: number, denominator: number) =>
  denominator > 0 ? numerator / denominator : 0;

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

const cs = (p: ScoreInput) => p.total_minions_killed + p.neutral_minions_killed;

/**
 * The nullable columns a row must have before it can be scored at all.
 *
 * Three, not the whole migration-005 set, and the distinction is the one this
 * module keeps making elsewhere: a null here would have to be read as a zero,
 * and a zero would be a lie. vision_score and total_damage_taken feed averages
 * and shares, and detector_wards_placed is most of a support's role score —
 * treating any of them as 0 invents a bad game.
 *
 * The objective takedown counts are deliberately *not* gated on, because they
 * are counts feeding a bounded bonus: absent means "no bonus earned", which is
 * the same thing zero means. That is not a nicety. Riot does not return
 * `dragonTakedowns` or `baronTakedowns` at the participant top level — they live
 * under `challenges`, which CHALLENGE_KEYS does not capture — so those two
 * columns are null on every row this database holds, and gating on them scored
 * precisely nothing.
 *
 * Exported because score-recompute.ts has to select exactly the rows this
 * predicate would accept. If its SQL filter were looser, it would pick up a row,
 * score it null, write nothing, and pick it up again on the next run — a queue
 * that never drains. One list, read by the predicate and by the query, is what
 * stops the two drifting into that.
 */
export const DETAIL_COLUMNS = [
  "vision_score",
  "total_damage_taken",
  "detector_wards_placed",
] as const satisfies readonly (keyof ScoreInput)[];

/**
 * Whether this row carries the detail columns the formula needs.
 *
 * The alternative — coalescing NULL to 0 — would score a pre-backfill row as a
 * player who dealt no damage and warded nothing, which is a plausible-looking
 * number that is simply wrong. `unified.ts` states the same rule for the same
 * reason: what a source cannot answer is null, never 0.
 *
 * Migration 005 added this whole set at once, so in practice a row has all of
 * them or none, but checking each is free and does not depend on that holding.
 */
function hasDetail(p: ScoreInput): boolean {
  return DETAIL_COLUMNS.every((column) => p[column] !== null);
}

/**
 * Scores every participant in one match, in the order they were given.
 *
 * The whole match at once rather than one row at a time, because three of the
 * five parts are relative: to the lobby's averages, to the opposite laner, and
 * to the player's own team's totals. A per-row entry point would either
 * recompute those ten times or quietly take them as arguments nobody could
 * supply.
 *
 * `null` in a slot means that row cannot be scored — see hasDetail. A match
 * where nobody has detail scores as ten nulls rather than ten zeroes.
 */
export function scoreMatch(
  participants: ScoreInput[],
  gameDurationSeconds: number,
): (number | null)[] {
  // Minutes, floored at 1. Every rate below divides by this, and a corrupt or
  // missing duration would otherwise turn each of them into an Infinity that
  // clamps to full marks.
  const minutes = Math.max(1, gameDurationSeconds / 60);

  // The lobby's own averages, over the players who have the columns to average.
  // This is what makes a 20-minute stomp and a 45-minute slog comparable: the
  // baseline moves with the game rather than being a constant tuned on one
  // patch at one elo.
  const scorable = participants.filter(hasDetail);
  const avgDpm = mean(scorable.map((p) => p.damage_dealt_to_champions / minutes));
  const avgCspm = mean(scorable.map((p) => cs(p) / minutes));
  const avgGpm = mean(scorable.map((p) => p.gold_earned / minutes));
  const avgVpm = mean(scorable.map((p) => (p.vision_score ?? 0) / minutes));

  return participants.map((p) => {
    if (!hasDetail(p)) return null;

    const team = participants.filter((other) => other.team_id === p.team_id);
    // The person playing the same role on the other side. Null when Riot could
    // not assign a position (it leaves team_position empty often enough in
    // flex) — the vsOpponent part then contributes nothing rather than guessing.
    const opponent =
      p.team_position === null
        ? null
        : (participants.find(
            (other) => other.team_id !== p.team_id && other.team_position === p.team_position,
          ) ?? null);

    const raw =
      globalPart(p, minutes, { avgDpm, avgCspm, avgGpm, avgVpm }) * WEIGHTS.global +
      vsOpponentPart(p, opponent, minutes) * WEIGHTS.vsOpponent +
      teamImpactPart(p, team) * WEIGHTS.teamImpact +
      rolePart(p, minutes) * WEIGHTS.role +
      objectivesPart(p) * WEIGHTS.objectives;

    return Math.round(clamp(raw, 0, 100));
  });
}

/**
 * Output per minute, each measured against this lobby's average rather than a
 * fixed target, then re-based to 0-100.
 *
 * Vision is weighted up for supports and down for everyone else: a support
 * out-warding four carries is doing their job, and a mid doing it is doing
 * someone else's.
 */
function globalPart(
  p: ScoreInput,
  minutes: number,
  averages: { avgDpm: number; avgCspm: number; avgGpm: number; avgVpm: number },
): number {
  const ratio = (value: number, average: number) => safeDiv(value / minutes, average || 1);

  const damage = clamp(ratio(p.damage_dealt_to_champions, averages.avgDpm) * 10, 0, 20);
  const farm = clamp(ratio(cs(p), averages.avgCspm) * 10, 0, 15);
  const gold = clamp(ratio(p.gold_earned, averages.avgGpm) * 10, 0, 20);

  const visionWeight = p.team_position === SUPPORT_POSITION ? 1.8 : 0.7;
  const vision = clamp(ratio(p.vision_score ?? 0, averages.avgVpm) * 10 * visionWeight, 0, 15);

  // Assists count for more on a support, where they are the record of the job
  // rather than a consolation for not getting the kill. Deaths floored at 1 so
  // a deathless game is (K+A)/1 rather than a division by zero — the same
  // convention player-stats.ts already uses for displayed KDA.
  const kda = safeDiv(
    p.kills + p.assists * (p.team_position === SUPPORT_POSITION ? 1.5 : 1),
    Math.max(1, p.deaths),
  );

  return damage + farm + gold + vision + clamp(kda * 3, 0, 20);
}

/**
 * The lane, on its own terms: this player against the one opposite them.
 *
 * 50 is an even matchup. Each dimension moves it by a bounded amount, so
 * winning lane on gold and CS while losing it on kills lands near even, which
 * is what it was.
 */
function vsOpponentPart(p: ScoreInput, opponent: ScoreInput | null, minutes: number): number {
  // No opposite number to compare against — an unassigned position, or a lobby
  // where the roles do not pair up. 50 is the neutral value, so this part
  // neither rewards nor punishes; it just stops contributing.
  if (!opponent || !hasDetail(opponent)) return 50;

  // `per` is how much of a gap is worth a full 10 points, per minute where the
  // quantity is a rate: 1 CS, 80 gold, 200 damage, or 4 net kills outright.
  const diff = (mine: number, theirs: number, per: number) =>
    clamp(((mine - theirs) / per) * 10, -12.5, 12.5);

  return clamp(
    50 +
      diff(cs(p) / minutes, cs(opponent) / minutes, 1) +
      diff(p.gold_earned / minutes, opponent.gold_earned / minutes, 80) +
      diff(
        p.damage_dealt_to_champions / minutes,
        opponent.damage_dealt_to_champions / minutes,
        200,
      ) +
      diff(p.kills + p.assists - p.deaths, opponent.kills + opponent.assists - opponent.deaths, 4),
    0,
    100,
  );
}

/**
 * How much of what the team did was this player.
 *
 * Kill participation, damage share and damage-taken share. The last one is why
 * a tank who dealt little can still score well: soaking is a contribution that
 * damage share alone reads as absence.
 */
function teamImpactPart(p: ScoreInput, team: ScoreInput[]): number {
  const teamKills = team.reduce((sum, t) => sum + t.kills, 0);
  const teamDamage = team.reduce((sum, t) => sum + t.damage_dealt_to_champions, 0);
  const teamTaken = team.reduce((sum, t) => sum + (t.total_damage_taken ?? 0), 0);

  // An even split of damage is 20% each, and the divisors sit above that so a
  // slightly-above-average game does not already max the part out. Kill
  // participation counts assists, so its ceiling is much higher than a share.
  const killParticipation = clamp(safeDiv(p.kills + p.assists, teamKills) / 0.5, 0, 1);
  const damageShare = clamp(safeDiv(p.damage_dealt_to_champions, teamDamage) / 0.3, 0, 1);
  const takenShare = clamp(safeDiv(p.total_damage_taken ?? 0, teamTaken) / 0.3, 0, 1);

  return killParticipation * 45 + damageShare * 35 + takenShare * 20;
}

/**
 * The part of the job that only this role has.
 *
 * Deliberately one dimension each rather than a second full profile: this is
 * 12% of the total, and the sibling app's much larger per-role model is the
 * thing that made its score hard to argue with when it disagreed with you.
 */
function rolePart(p: ScoreInput, minutes: number): number {
  const perMin = (value: number | null) => (value ?? 0) / minutes;

  switch (p.team_position) {
    // Vision is the support's output, and control wards are the part of it
    // that costs them gold they could have spent on themselves.
    case SUPPORT_POSITION:
      return clamp(
        (perMin(p.vision_score) / 1.6) * 60 + (perMin(p.detector_wards_placed) / 0.35) * 40,
        0,
        100,
      );
    // Camps cleared, as the readable half of pathing.
    case "JUNGLE":
      return clamp((perMin(p.neutral_minions_killed) / 5.5) * 100, 0, 100);
    // Everyone else: lane CS.
    case "TOP":
    case "MIDDLE":
    case "BOTTOM":
      return clamp((perMin(p.total_minions_killed) / 8) * 100, 0, 100);
    // Riot could not assign a position. Neutral, for the reason vsOpponentPart
    // returns 50 in the same situation.
    default:
      return 50;
  }
}

/**
 * Objectives, from takedown counters.
 *
 * The sibling app used `damageDealtToObjectives`, which this schema does not
 * store. The takedown columns it does store are arguably the better signal
 * anyway: they count the objectives that were actually taken, where objective
 * damage counts hitting one you then lost.
 *
 * Weighted by what each is worth to a game rather than by how hard it is to
 * reach, which is why an inhibitor outscores a dragon.
 *
 * In practice the dragon and baron terms are dead against this database: Riot
 * returns those two only under `challenges`, so the columns are null and both
 * fall through to 0. The part still separates players on turrets, inhibitors
 * and steals, and it does so evenly, because the gap is the same for everyone.
 * Capturing them would mean adding the two keys to CHALLENGE_KEYS in
 * lib/riot.ts, reading them from the jsonb, and re-fetching match details.
 */
function objectivesPart(p: ScoreInput): number {
  const weighted =
    (p.dragon_takedowns ?? 0) * 1 +
    (p.baron_takedowns ?? 0) * 2 +
    (p.turret_takedowns ?? 0) * 1.5 +
    (p.inhibitor_takedowns ?? 0) * 2.5 +
    // A steal is worth a great deal more than the objective it denies.
    (p.objectives_stolen ?? 0) * 3;

  // 8 weighted points is a thoroughly objective-focused game; above that adds
  // nothing, because the part is already full.
  return clamp((weighted / 8) * 100, 0, 100);
}

/**
 * The same ten rows back with `performance_score` on each.
 *
 * The shape both sync write paths want: they already hold every participant of
 * one match as a row ready to insert, and this is the last thing done to that
 * array before it goes to the database. Generic over the row type so it adds a
 * field rather than replacing one — the callers are passing full
 * `match_participants` rows, not bare ScoreInputs.
 */
export function withPerformanceScores<T extends ScoreInput>(
  rows: T[],
  gameDurationSeconds: number,
): (T & { performance_score: number | null })[] {
  const scores = scoreMatch(rows, gameDurationSeconds);
  return rows.map((row, index) => ({
    ...row,
    performance_score: scores[index],
  }));
}

/**
 * Which of our own players had the best and worst game.
 *
 * Scoped to *tracked* players — rows with a player_id — rather than to one
 * team, because "our side" is not a thing this schema records for a Riot match:
 * five roster members in a flex game are five tracked rows on team 100, and a
 * soloQ game is one tracked row among ten.
 *
 * Which has a consequence worth stating plainly: a soloQ game has exactly one
 * tracked player, so it gets no MVP and no INT. The badges are a full-stack
 * flex feature in practice, and the `>= 2` gate is what keeps a lone soloQ
 * player from being crowned MVP of a lobby they were 10th in.
 *
 * Ties go to the earlier row, which is arbitrary but stable.
 */
export function mvpAndInt<T extends { player_id: string | null; performance_score: number | null }>(
  rows: T[],
): { mvp: T | null; int: T | null } {
  const tracked = rows.filter(
    (r): r is T & { performance_score: number } =>
      r.player_id !== null && r.performance_score !== null,
  );
  if (tracked.length < 2) return { mvp: null, int: null };

  let mvp = tracked[0];
  let low = tracked[0];
  for (const row of tracked) {
    if (row.performance_score > mvp.performance_score) mvp = row;
    if (row.performance_score < low.performance_score) low = row;
  }

  // Everyone scored identically — vanishingly unlikely, but crowning one of
  // them MVP and another the INT would be inventing a difference.
  if (mvp.performance_score === low.performance_score) return { mvp: null, int: null };

  return { mvp, int: low };
}

/**
 * How many games each player was the best, and the worst, of ours in.
 *
 * Folds `mvpAndInt` over a set of rows grouped by game. The rows may be from any
 * mix of sources: a team match carries no score, so it groups, finds nothing
 * scorable and contributes nothing — no source filter needed at the call site.
 *
 * The counts are only ever meaningful over games several of us were in, which in
 * practice means flex. A soloQ-only scope returns an empty map rather than five
 * zeroes, and the caller can tell the difference between "nobody has an MVP" and
 * "this scope cannot have MVPs" by whether it asked for one that can.
 */
export function mvpCountsByPlayer<
  T extends { match_key: string; player_id: string | null; performance_score: number | null },
>(rows: T[]): Map<string, { mvps: number; ints: number }> {
  const byGame = new Map<string, T[]>();
  for (const row of rows) {
    const list = byGame.get(row.match_key);
    if (list) list.push(row);
    else byGame.set(row.match_key, [row]);
  }

  const counts = new Map<string, { mvps: number; ints: number }>();
  const bump = (playerId: string, key: "mvps" | "ints") => {
    const entry = counts.get(playerId) ?? { mvps: 0, ints: 0 };
    entry[key] += 1;
    counts.set(playerId, entry);
  };

  for (const game of byGame.values()) {
    const { mvp, int } = mvpAndInt(game);
    if (mvp?.player_id) bump(mvp.player_id, "mvps");
    if (int?.player_id) bump(int.player_id, "ints");
  }
  return counts;
}
