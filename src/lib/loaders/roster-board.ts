// The five, their record and their champion pool, folded once per source.
//
// The filter on the home page is client state rather than a link, and this is
// what makes that affordable: all four readings are computed here in one pass
// and handed over together, so switching is a re-render rather than a round
// trip. The repo's rule is that a different *query* is a link — four foldings of
// rows already in hand is not a different query.
//
// What travels is deliberately the *aggregate*, not the rows. Folding in the
// browser would mean shipping every participant row the team has ever played —
// thousands — to save a fold that takes microseconds on the server.
//
// Pure: no I/O, no React.

import { allChampionsByPlayer, championWinRate, type ChampionAgg } from "@/lib/champion-stats";
import { aggregatePlayerStats, kdaRatio, playerWinRate } from "@/lib/player-stats";
import { SOURCE_NAMES, recordsFor, type SourceName } from "@/lib/scope";
import type { UnifiedRow } from "@/lib/unified";
import type { TeamMember } from "@/lib/team/roster";
import type { PlayerRecordRows } from "@/lib/loaders/players";

/**
 * How many champions each card shows — the same five the player page opens on
 * (`POOL_PREVIEW`), so "their pool" means one thing in both places. Five cards
 * across is the constraint that decides whether they fit; at a fifth of the page
 * five 28px portraits do.
 */
export const POOL_SIZE = 5;

export type RosterChampion = {
  championId: number;
  championName: string;
  games: number;
  winRate: number;
};

export type RosterCard = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  teamRole: string;
  games: number;
  wins: number;
  winRate: number;
  /** Null when no game in this source recorded what it needs. */
  kda: number | null;
  champions: RosterChampion[];
};

export type RosterBoard = Record<SourceName, RosterCard[]>;

function toChampion(agg: ChampionAgg): RosterChampion {
  return {
    championId: agg.championId,
    championName: agg.championName,
    games: agg.games,
    winRate: championWinRate(agg),
  };
}

function cardsFor(team: TeamMember[], rows: UnifiedRow[]): RosterCard[] {
  const byPlayer = aggregatePlayerStats(rows);
  const pools = allChampionsByPlayer(rows);

  // Driven by the roster, not by the rows: a player with nothing in this source
  // renders as a card with zeros rather than disappearing, which is the whole
  // reason the team is read separately from the games it played.
  return team.map((member) => {
    const agg = byPlayer.get(member.id);
    return {
      id: member.id,
      slug: member.slug,
      displayName: member.display_name,
      avatarUrl: member.avatar_url,
      teamRole: member.team_role,
      games: agg?.games ?? 0,
      wins: agg?.wins ?? 0,
      winRate: agg ? playerWinRate(agg) : 0,
      kda: agg && agg.games > 0 ? kdaRatio(agg) : null,
      champions: (pools.get(member.id) ?? []).slice(0, POOL_SIZE).map(toChampion),
    };
  });
}

export function buildRosterBoard(team: TeamMember[], rows: PlayerRecordRows): RosterBoard {
  return Object.fromEntries(
    SOURCE_NAMES.map((source) => [
      source,
      cardsFor(team, recordsFor(source).flatMap((record) => rows[record])),
    ]),
  ) as RosterBoard;
}
