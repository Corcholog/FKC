// The roster, with each player's top champions — /team and /demo.
//
// First loader written against DataSource rather than a SupabaseClient (see
// src/lib/data-source.ts). The private page passes privateSource(), the demo
// page passes demoSource(), and the query below doesn't know which it got: the
// demo_* views expose the same column names, so the only difference is what
// `source.table()` returns.

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { rows } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import { rankSortKey } from "@/lib/rank";
import { topChampionsByPlayer, type ChampionAgg, type ChampionStatInput } from "@/lib/champion-stats";

export type RosterPlayer = {
  id: string;
  slug: string;
  display_name: string;
  riot_game_name: string;
  riot_tag_line: string;
  avatar_url: string | null;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  wins: number | null;
  losses: number | null;
};

const ROSTER_COLUMNS =
  "id, slug, display_name, riot_game_name, riot_tag_line, avatar_url, tier, division, league_points, wins, losses";

type StatRow = Omit<ChampionStatInput, "game_duration_seconds"> & {
  matches: { game_duration_seconds: number } | null;
};

/**
 * The raw reads, before any folding.
 *
 * Split from the aggregation below because this is the half that gets cached on
 * the demo (see demo-cache.ts) and a cache entry has to survive serialization —
 * so everything here is plain arrays. `Roster` holds a Map and cannot be cached
 * directly; that's the whole reason these are two functions.
 */
export type RosterRows = {
  players: RosterPlayer[];
  statRows: ChampionStatInput[];
};

export type Roster = {
  /** Best rank first. */
  players: RosterPlayer[];
  topChampionsByPlayerId: Map<string, ChampionAgg[]>;
};

export async function fetchRosterRows(source: DataSource): Promise<RosterRows> {
  const players = rows(
    await source.supabase
      .from(source.table("players"))
      .select(ROSTER_COLUMNS)
      .returns<RosterPlayer[]>(),
    "roster",
  );

  // One bulk query across every tracked player rather than one per card —
  // grouping into per-player top-5 champions happens in JS afterward. Paged,
  // because PostgREST truncates at the project's Max rows without saying so and
  // a truncated read here silently rewrites everyone's champion pool.
  const statRows = await fetchAllRows<StatRow>((from, to) =>
    source.supabase
      .from(source.table("match_participants"))
      .select(
        `player_id, champion_id, champion_name, win, total_cs, damage_dealt_to_champions, ${source.table("matches")}!inner(game_duration_seconds)`,
      )
      .not("player_id", "is", null)
      .range(from, to)
      .returns<StatRow[]>(),
  );

  // The embed comes back under the table's own name, so read it off whichever
  // one was queried rather than hardcoding "matches".
  const embedKey = source.table("matches");
  const flatRows: ChampionStatInput[] = statRows.map((r) => {
    const embedded = (r as unknown as Record<string, { game_duration_seconds: number } | null>)[embedKey];
    return { ...r, game_duration_seconds: embedded?.game_duration_seconds ?? 0 };
  });

  return { players, statRows: flatRows };
}

/** Pure. Rows in, the shape the page renders out. */
export function buildRoster(rows: RosterRows): Roster {
  return {
    players: [...rows.players].sort((a, b) => rankSortKey(a) - rankSortKey(b)),
    topChampionsByPlayerId: topChampionsByPlayer(rows.statRows),
  };
}

export async function loadRoster(source: DataSource): Promise<Roster> {
  return buildRoster(await fetchRosterRows(source));
}
