// The roster-wide match history — /matches.
//
// Same fetch/build split as the other loaders here:
// `fetchMatchesPageRows` returns plain arrays and can sit behind the data cache,
// `buildMatchesPage` does the grouping and produces the entries the list renders.

import { rows } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import {
  groupParticipantsByMatch,
  loadMatchRowParticipants,
  matchComposition,
  type MatchComposition,
  type MatchRowParticipant,
} from "@/lib/match-rows";

// Matches per page. This counts *matches*, not rendered rows: with no player
// filter, one game that several tracked players were in renders a row each, so
// a page can show more rows than this.
export const MATCHES_PER_PAGE = 50;

// Page-number pagination rather than a cursor. The tradeoff: an offset can
// drift if rows are inserted at the head between page views, which here means
// only during a sync (daily, or when someone presses the button) — a match
// could then repeat across a page boundary. In exchange the page gets a real
// "page 2 of 7" and a total count, which a cursor can't give without a second
// query. At this history's size the deep-offset cost is nil.
export function parsePage(raw: string | undefined): number {
  const parsed = Number(raw);
  // Rejects "abc", "0", "-3", "1.5" and Infinity — anything not a whole page.
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

export type MatchesPlayer = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
};

export type MatchesListRow = {
  id: string;
  /** See MatchRowData.riotMatchId. */
  riot_match_id: string | null;
  game_creation: string;
  game_duration_seconds: number;
};

export type MatchesPageRows = {
  players: MatchesPlayer[];
  matchList: MatchesListRow[];
  /** Matching *matches* across every page — what the pagination footer counts. */
  totalMatches: number;
  participants: MatchRowParticipant[];
};

export async function fetchMatchesPageRows(
  source: DataSource,
  { playerSlug, page }: { playerSlug: string | null; page: number },
): Promise<MatchesPageRows> {
  const players = rows(
    await source.supabase
      .from(source.table("players"))
      .select("id, slug, display_name, avatar_url")
      .order("display_name")
      .returns<MatchesPlayer[]>(),
    "roster",
  );

  // An unknown ?player= slug falls through to no filter rather than 404ing —
  // the page is still a valid, complete answer to "show me the history".
  const selectedPlayer = playerSlug ? (players.find((p) => p.slug === playerSlug) ?? null) : null;

  const participantsTable = source.table("match_participants");
  const from = (page - 1) * MATCHES_PER_PAGE;

  // Query from matches (true top-level order — see loaders/player.ts for why
  // ordering "through" an embedded match_participants collection no-ops).
  //
  // count: "exact" is returned alongside the page and counts parent rows, so
  // it's the number of matching *matches* — an embed doesn't multiply the
  // parent the way a SQL join would.
  let matchQuery = source.supabase
    .from(source.table("matches"))
    .select(
      `id, riot_match_id, game_creation, game_duration_seconds, ${participantsTable}!inner(player_id)`,
      { count: "exact" },
    )
    .order("game_creation", { ascending: false })
    .range(from, from + MATCHES_PER_PAGE - 1);

  matchQuery = selectedPlayer
    ? matchQuery.eq(`${participantsTable}.player_id`, selectedPlayer.id)
    : matchQuery.not(`${participantsTable}.player_id`, "is", null);

  const matchListResult = await matchQuery.returns<MatchesListRow[]>();
  // Read the count off the result before `rows` narrows it to the data array.
  const totalMatches = matchListResult.count ?? 0;

  // Missing rather than
  // null. Normalising here keeps the cached shape the same on both sides.
  const matchList = rows(matchListResult, "match history page").map((m) => ({
    ...m,
    riot_match_id: m.riot_match_id ?? null,
  }));

  const participants = await loadMatchRowParticipants(
    source,
    matchList.map((m) => m.id),
  );

  return { players, matchList, totalMatches, participants };
}

export type MatchEntry = MatchComposition & {
  match: MatchesListRow;
  /** The participant row the match is being told from — one per tracked player in it. */
  viewer: MatchRowParticipant;
  /** Undefined only if the roster read and the participant rows disagree. */
  player: MatchesPlayer | undefined;
};

export type MatchesPage = {
  players: MatchesPlayer[];
  selectedPlayer: MatchesPlayer | null;
  entries: MatchEntry[];
  totalMatches: number;
  totalPages: number;
};

/** Pure. Rows in, one entry per rendered row out. */
export function buildMatchesPage(data: MatchesPageRows, playerSlug: string | null): MatchesPage {
  const playersById = new Map(data.players.map((p) => [p.id, p]));
  const selectedPlayer = playerSlug
    ? (data.players.find((p) => p.slug === playerSlug) ?? null)
    : null;

  const participantsByMatch = groupParticipantsByMatch(data.participants);

  const entries = data.matchList.flatMap((match) => {
    const participants = participantsByMatch.get(match.id) ?? [];
    // Untracked participants have a null player_id and never get their own row.
    const viewers = selectedPlayer
      ? participants.filter((p) => p.player_id === selectedPlayer.id)
      : participants.filter((p) => p.player_id);

    return viewers.map((viewer) => ({
      match,
      viewer,
      ...matchComposition(participants, viewer),
      player: playersById.get(viewer.player_id as string),
    }));
  });

  return {
    players: data.players,
    selectedPlayer,
    entries,
    totalMatches: data.totalMatches,
    totalPages: Math.max(1, Math.ceil(data.totalMatches / MATCHES_PER_PAGE)),
  };
}
