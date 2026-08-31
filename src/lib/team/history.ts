// The team's match history: every game the team played, in one stream.
//
// Two records feed it and neither one is shaped like the other. A team match is
// a row somebody typed or a replay filled in — an opponent, a draft, a date and
// no clock. A flex game is ten Riot participant rows, five of which happen to be
// us. What they have in common is the only thing this page is about: **our
// composition, their composition, and how it went.**
//
// So both are folded into one entry shape here, and the surfaces downstream
// never branch on where a game came from except where the difference is real —
// a flex game has no opponent name and links out to a third-party site, a team
// match has a draft to open in place.
//
// The flex fold is the reason this module exists at all. `flex_participants`
// stores one row per player per game, so a five-stack game arrives as five rows
// that are the *same game* seen five times. Rendering those as five entries is
// what a squad-wide soloQ feed does correctly and what a team history must not:
// the team played one game, and it says so once.
//
// Pure: no I/O, no React, no Supabase.

import { sortByRole } from "@/lib/roles";
import { teamMatchTimestamp } from "@/lib/unified";
import { recordOf, type TeamRecord } from "@/lib/team/roster";
import {
  TEAM_MATCH_KINDS,
  seriesLabel,
  type TeamGameView,
  type TeamMatchKind,
  type TeamPickRow,
  type TeamSide,
} from "@/lib/team/types";

// ------------------------------------------------------------
// One entry
// ------------------------------------------------------------

/**
 * A champion in one of the two team strips.
 *
 * Deliberately not a participant row and not a pick row: the strip renders the
 * same way whichever it came from, and the four stat fields are the only ones
 * both records actually carry.
 */
export type HistoryChampion = {
  championId: number;
  championName: string;
  /** Set when the row belongs to somebody on the roster. Resolved to a name at render. */
  playerId: string | null;
  /** A name with nobody behind it: an enemy, a substitute, an untracked stranger. */
  playerName: string | null;
  teamPosition: string | null;
  kills: number;
  deaths: number;
  assists: number;
  totalCs: number;
};

type HistoryEntryBase = {
  /** Match id for flex, game id for a team match. Unique within the stream either way. */
  id: string;
  /** ISO, UTC. Team matches sit at midday — see unified.ts for why. */
  playedAt: string;
  /** Null when nobody recorded one, which hand-entered team games often don't. */
  durationSeconds: number | null;
  /** "Scrim", "Flex", "LIDE 2 · Fecha 3" — what to put in the row's chip. */
  label: string;
  /**
   * Which half of the map we were on.
   *
   * Not decoration. Blue picks first in every standard draft, so side is half of
   * why a draft looks the way it does — and on a row that puts our champions on
   * the left whichever side we played, there is otherwise nothing to read it
   * from. A team match records it (`team_games.side`); a flex game has it in
   * `team_id`, which this module was already computing and throwing away.
   */
  side: TeamSide;
  /**
   * Always the team's own result.
   *
   * Unambiguous on both sources, and only since the sync started gating flex:
   * a game the roster played against itself would be won and lost by the same
   * people, and no single boolean could describe it. Such a game is no longer
   * stored — see lib/team/roster.ts.
   */
  win: boolean;
  allies: HistoryChampion[];
  enemies: HistoryChampion[];
  /** Empty when nothing was recorded. Rendered only if non-empty — see the row. */
  allyBans: number[];
  enemyBans: number[];
};

export type FlexHistoryEntry = HistoryEntryBase & {
  source: "flex";
  /**
   * Null on the demo, which publishes no riot_match_id on purpose — it is the
   * one field that de-anonymizes a whole lobby. With no id there is no link out,
   * which is the demo behaving correctly rather than a missing feature.
   */
  riotMatchId: string | null;
  /** How many of the main team played it. Five unless a sub was on the far side. */
  teamPlayers: number;
};

export type TeamMatchHistoryEntry = HistoryEntryBase & {
  source: "team";
  kind: TeamMatchKind;
  opponentName: string;
  opponentSlug: string;
  seriesId: string;
  gameNumber: number;
  /** Carried whole so the expanded panel can render the full draft and its notes. */
  game: TeamGameView;
};

export type HistoryEntry = FlexHistoryEntry | TeamMatchHistoryEntry;

// ------------------------------------------------------------
// Flex
// ------------------------------------------------------------

/**
 * Every participant row of a flex match — tracked and untracked both.
 *
 * The untracked five are not optional. They are the enemy composition, which is
 * half of what this page is for, and they are also what makes "were all five of
 * ours on the same side" answerable at all.
 */
export type FlexHistoryInput = {
  match_id: string;
  player_id: string | null;
  team_id: number;
  team_position: string | null;
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
  /** Flattened off the match embed by the loader, so nothing here reaches through it. */
  game_creation: string;
  game_duration_seconds: number;
  riot_match_id: string | null;
  blue_bans: number[];
  red_bans: number[];
};

const BLUE_TEAM_ID = 100;

function toChampion(row: FlexHistoryInput, riotName: string | null): HistoryChampion {
  return {
    championId: row.champion_id,
    championName: row.champion_name,
    playerId: row.player_id,
    playerName: riotName,
    teamPosition: row.team_position,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    totalCs: row.total_cs,
  };
}

/**
 * One entry per flex match, told from the side the team was on.
 *
 * Takes the roster rather than inferring it: "our side" is the side with more
 * *team members*, which is the same question the sync asked before storing the
 * game. Counting any tracked player instead would let a friend on the far side
 * tip a game the wrong way round.
 */
export function buildFlexHistory(
  rows: FlexHistoryInput[],
  teamPlayerIds: Set<string>,
): FlexHistoryEntry[] {
  const byMatch = new Map<string, FlexHistoryInput[]>();
  for (const row of rows) {
    const list = byMatch.get(row.match_id);
    if (list) list.push(row);
    else byMatch.set(row.match_id, [row]);
  }

  const entries: FlexHistoryEntry[] = [];

  for (const [matchId, participants] of byMatch) {
    const teamBySide = new Map<number, number>();
    for (const row of participants) {
      if (!row.player_id || !teamPlayerIds.has(row.player_id)) continue;
      teamBySide.set(row.team_id, (teamBySide.get(row.team_id) ?? 0) + 1);
    }
    // No team member at all means the row predates the gate, or the roster
    // changed under it. Either way there is no "us" to tell it from, and a
    // history of somebody else's flex games is not what this page is.
    if (teamBySide.size === 0) continue;

    // Ties break to blue, so the same match always renders the same way round.
    const [ourSide, teamPlayers] = [...teamBySide.entries()].sort(
      (a, b) => b[1] - a[1] || a[0] - b[0],
    )[0];

    const ours = participants.filter((p) => p.team_id === ourSide);
    const theirs = participants.filter((p) => p.team_id !== ourSide);
    const first = participants[0];
    const blue = ourSide === BLUE_TEAM_ID;

    entries.push({
      source: "flex",
      id: matchId,
      playedAt: first.game_creation,
      durationSeconds: first.game_duration_seconds,
      label: "Flex",
      side: blue ? "blue" : "red",
      win: ours[0].win,
      allies: sortByRole(ours).map((p) => toChampion(p, null)),
      enemies: sortByRole(theirs).map((p) => toChampion(p, null)),
      allyBans: blue ? first.blue_bans : first.red_bans,
      enemyBans: blue ? first.red_bans : first.blue_bans,
      riotMatchId: first.riot_match_id,
      teamPlayers,
    });
  }

  return entries;
}

// ------------------------------------------------------------
// Team matches
// ------------------------------------------------------------

/**
 * One side's picks as champion rows, in role order.
 *
 * Exported because the draft board on the series pages needs the same mapping
 * from the same rows, and two copies of it drift the first time a column is
 * added — as a blank cell, not as an error.
 */
export function pickChampions(picks: TeamPickRow[], ally: boolean): HistoryChampion[] {
  return sortByRole(picks.filter((p) => p.ally === ally)).map(
    (p): HistoryChampion => ({
      championId: p.champion_id,
      championName: p.champion_name,
      playerId: p.player_id,
      playerName: p.player_name,
      teamPosition: p.team_position,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      totalCs: p.total_cs,
    }),
  );
}

/** One entry per recorded game. A best-of-three is three entries, as it was three games. */
export function buildTeamMatchHistory(games: TeamGameView[]): TeamMatchHistoryEntry[] {
  return games.map((game) => {
    const side = (ally: boolean) => pickChampions(game.picks, ally);

    return {
      source: "team" as const,
      id: game.id,
      playedAt: teamMatchTimestamp(game.series.played_on),
      durationSeconds: game.duration_seconds,
      label: seriesLabel(game.series, game.competition),
      side: game.side,
      win: game.win,
      allies: side(true),
      enemies: side(false),
      allyBans: game.ally_bans,
      enemyBans: game.enemy_bans,
      kind: game.series.kind,
      opponentName: game.opponent.name,
      opponentSlug: game.opponent.slug,
      seriesId: game.series.id,
      gameNumber: game.game_number,
      game,
    };
  });
}

/**
 * The two streams merged, newest first.
 *
 * `sort` is stable in every JS engine that matters, and that is load-bearing
 * here rather than incidental: every game of one series shares a single
 * timestamp — the day it was played, at midday — so the incoming order is what
 * keeps a best-of-three contiguous and in playing order instead of scattering
 * its three games by whatever the comparator felt like. `loadTeamGames` already
 * returns them that way, which is why team entries are appended after flex and
 * not re-sorted among themselves.
 */
export function mergeHistory(
  flex: FlexHistoryEntry[],
  team: TeamMatchHistoryEntry[],
): HistoryEntry[] {
  return [...flex, ...team].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

// ------------------------------------------------------------
// Narrowing it down
// ------------------------------------------------------------

/**
 * What the source filter can be set to.
 *
 * Flex sits beside the three team-match kinds rather than opposite them, because
 * "how did we do in officials" and "how did we do in flex" are the same question
 * asked of two records — and a two-way flex/team split would need a second
 * control to get from "team" to "officials".
 */
export const HISTORY_VIEWS = ["all", "flex", ...TEAM_MATCH_KINDS] as const;
export type HistoryView = (typeof HISTORY_VIEWS)[number];

export const HISTORY_VIEW_LABELS: Record<HistoryView, string> = {
  all: "Everything",
  flex: "Flex",
  scrim: "Scrims",
  friendly: "Friendlies",
  official: "Officials",
};

/** Anything unrecognised falls back to the whole history rather than to nothing. */
export function parseHistoryView(raw: string | string[] | undefined): HistoryView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return HISTORY_VIEWS.find((v) => v === value) ?? "all";
}

export function matchesView(entry: HistoryEntry, view: HistoryView): boolean {
  if (view === "all") return true;
  if (view === "flex") return entry.source === "flex";
  return entry.source === "team" && entry.kind === view;
}

export function filterHistory(entries: HistoryEntry[], view: HistoryView): HistoryEntry[] {
  return view === "all" ? entries : entries.filter((entry) => matchesView(entry, view));
}

/**
 * How many games each filter would show, counted over the *unfiltered* stream.
 *
 * Same call teamMatchFilterOptions makes and for the same reason: a control
 * whose options are derived from its own result is a dead end, and a count beside
 * each one turns an empty view into a visibly empty combination rather than a
 * page that looks broken.
 */
export function historyViewCounts(entries: HistoryEntry[]): Record<HistoryView, number> {
  const counts = { all: entries.length, flex: 0, scrim: 0, friendly: 0, official: 0 };
  for (const entry of entries) {
    if (entry.source === "flex") counts.flex += 1;
    else counts[entry.kind] += 1;
  }
  return counts;
}

/** The team's record over a set of entries. */
export function historyRecord(entries: HistoryEntry[]): TeamRecord {
  return recordOf(entries);
}
