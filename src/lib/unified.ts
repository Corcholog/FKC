// One row shape covering all three sources, so mixed statistics need no new
// aggregation code.
//
// The trick — and it is the whole module — is that a unified row is shaped like
// a `match_participants` row, snake_case column names and all. Every aggregator
// in src/lib/*-stats.ts is structurally typed over those names rather than over
// a nominal row type, so `aggregatePlayerStats`, `aggregateMainRoleStats`,
// `aggregateByRole`, `streaksByPlayer`, `topChampionsByPlayer`,
// `championWinRate` and both champion comparators all apply to the result
// unchanged. lib/team/stats.ts already proved the pattern with
// `toChampionStatInput`; this generalises it.
//
// What a source cannot answer is `null`, never `0`. A team match records no
// damage and no vision, and 0 is a real value that would drag an average down
// where null means "this game doesn't answer that". The clocks in
// player-stats.ts (damageDurationSeconds, detailDurationSeconds) are what make
// the distinction pay off.
//
// Pure: no I/O, no React, no Supabase.

import type { StatSource } from "@/lib/scope";
import type { TeamGameRow, TeamPickRow, TeamSeriesRow } from "@/lib/team/types";

export type UnifiedRow = {
  /** Which record this came from. Carried so a page can split or label by it. */
  source: StatSource;
  /** Null for an untracked participant, and for an enemy or substitute pick. */
  player_id: string | null;
  team_position: string | null;
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
  /** ISO. From the match for a Riot game, from the series date for a team match. */
  game_creation: string;
  game_duration_seconds: number;

  // Riot-only, and null on a team match — see the header.
  damage_dealt_to_champions: number | null;
  gold_earned: number | null;
  vision_score: number | null;
};

/**
 * The columns a participant row must carry to become a unified one.
 *
 * Structural, like every other *Input type here, so a page can select one
 * superset of columns and pass the same array to several aggregators.
 */
export type ParticipantInput = {
  player_id: string | null;
  team_position: string | null;
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
  damage_dealt_to_champions: number;
  gold_earned?: number | null;
  vision_score?: number | null;
  game_creation: string;
  game_duration_seconds: number;
};

/**
 * The instant a team match sorts at, given the day it was played.
 *
 * Midday rather than midnight: a date-only value read back as a timestamp lands
 * at 00:00 UTC, which is the previous evening in Buenos Aires — so a game would
 * sort into the day before the one it was played.
 *
 * Every surface that puts team matches in time order with Riot games has to use
 * this same key, or a scrim and that evening's flex game order by two different
 * conventions. The result is a UTC ISO string, which compares lexicographically
 * against the ones PostgREST returns.
 */
export function teamMatchTimestamp(playedOn: string): string {
  return `${playedOn}T12:00:00Z`;
}

export function fromParticipant(
  row: ParticipantInput,
  source: "soloq" | "flexq",
): UnifiedRow {
  return {
    source,
    player_id: row.player_id,
    team_position: row.team_position,
    champion_id: row.champion_id,
    champion_name: row.champion_name,
    win: row.win,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    total_cs: row.total_cs,
    game_creation: row.game_creation,
    game_duration_seconds: row.game_duration_seconds,
    damage_dealt_to_champions: row.damage_dealt_to_champions,
    gold_earned: row.gold_earned ?? null,
    vision_score: row.vision_score ?? null,
  };
}

/**
 * A team-match pick, with the game and series it belongs to.
 *
 * Three things this has to get right, and each is invisible in the output if it
 * doesn't:
 *
 * **The result is the team's, and the enemy's is its opposite.** `team_games.win`
 * is always *ours*, so every enemy-side aggregate negates it — the same rule
 * aggregatePicks, toChampionStatInput and deriveOpponentRoster each state at the
 * top of their loop. Getting it backwards inverts every scouting conclusion
 * while the numbers still look plausible.
 *
 * **A game with no duration has no minutes.** `duration_seconds` is nullable
 * because it is typed by hand and often skipped. Passing 0 would put the game in
 * every per-minute denominator at zero weight, which is right, but it would also
 * count toward csDurationSeconds via a game that did have CS. Returning null
 * from the wrapper and dropping the row is the caller's job; this reports 0 and
 * says so, because every clock in player-stats.ts is a sum and 0 adds nothing.
 *
 * **A team match has no clock of its own.** `played_on` is a date, not a
 * timestamp — nobody records what time a scrim started — so ordering by it is
 * day-accurate and no finer. Streaks and recent-form lists built over a mixed
 * scope will interleave a day's team games with that day's soloQ arbitrarily.
 */
export function fromTeamPick(
  pick: TeamPickRow,
  game: Pick<TeamGameRow, "win" | "duration_seconds">,
  series: Pick<TeamSeriesRow, "played_on">,
): UnifiedRow {
  return {
    source: "team",
    // Enemies and untracked substitutes have none, and stay out of per-player
    // aggregates for exactly the reason an untracked soloQ participant does.
    player_id: pick.player_id,
    team_position: pick.team_position,
    champion_id: pick.champion_id,
    champion_name: pick.champion_name,
    win: pick.ally ? game.win : !game.win,
    kills: pick.kills,
    deaths: pick.deaths,
    assists: pick.assists,
    total_cs: pick.total_cs,
    game_creation: teamMatchTimestamp(series.played_on),
    game_duration_seconds: game.duration_seconds ?? 0,
    damage_dealt_to_champions: null,
    gold_earned: null,
    vision_score: null,
  };
}

/** Every ally pick in a set of team games, as unified rows. */
export function fromTeamGames(
  games: {
    win: boolean;
    duration_seconds: number | null;
    series: Pick<TeamSeriesRow, "played_on">;
    picks: TeamPickRow[];
  }[],
  { allies = true, enemies = false }: { allies?: boolean; enemies?: boolean } = {},
): UnifiedRow[] {
  const out: UnifiedRow[] = [];
  for (const game of games) {
    for (const pick of game.picks) {
      if (pick.ally ? !allies : !enemies) continue;
      out.push(fromTeamPick(pick, game, game.series));
    }
  }
  return out;
}

/** How many rows each source contributed — for captions that name their sample. */
export function countBySource(rows: UnifiedRow[]): Record<StatSource, number> {
  const counts: Record<StatSource, number> = { soloq: 0, flexq: 0, team: 0 };
  for (const row of rows) counts[row.source] += 1;
  return counts;
}

/**
 * "12 soloQ, 4 flex, 6 team" — the sample a mixed number was built from.
 *
 * Sources with no rows are left out rather than printed as zero: this sits under
 * a stat as its sample size, and "0 flex" is noise on a page about somebody who
 * doesn't play it.
 */
export function describeSample(rows: UnifiedRow[]): string {
  const counts = countBySource(rows);
  const parts: string[] = [];
  if (counts.soloq) parts.push(`${counts.soloq} soloQ`);
  if (counts.flexq) parts.push(`${counts.flexq} flex`);
  if (counts.team) parts.push(`${counts.team} team`);
  return parts.length > 0 ? parts.join(", ") : "no games";
}
