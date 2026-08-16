// One player's full champion pool — /champions and /demo/champions.
//
// Kept as a loader rather than a shared view component, unlike the player page:
// the JSX here is a header and one list, so a second copy of it costs less than
// the indirection would. What must not be duplicated is the read, because that
// is where the demo's aliasing lives.

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { rows } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import { allChampionsByPlayer, type ChampionAgg, type ChampionStatInput } from "@/lib/champion-stats";

export type ChampionsPlayer = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
};

type StatRow = Omit<ChampionStatInput, "game_duration_seconds"> & {
  matches: { game_duration_seconds: number } | null;
};

export async function fetchChampionsRoster(source: DataSource): Promise<ChampionsPlayer[]> {
  return rows(
    await source.supabase
      .from(source.table("players"))
      .select("id, slug, display_name, avatar_url")
      .order("display_name")
      .returns<ChampionsPlayer[]>(),
    "roster",
  );
}

/** Flat rows, so this is safe to put behind the demo data cache. */
export async function fetchChampionRows(
  source: DataSource,
  playerId: string,
): Promise<ChampionStatInput[]> {
  const matchesTable = source.table("matches");

  const statRows = await fetchAllRows<StatRow>((from, to) =>
    source.supabase
      .from(source.table("match_participants"))
      .select(
        `player_id, champion_id, champion_name, win, kills, deaths, assists, total_cs, damage_dealt_to_champions, ${matchesTable}!inner(game_duration_seconds)`,
      )
      .eq("player_id", playerId)
      .range(from, to)
      .returns<StatRow[]>(),
  );

  return statRows.map((r) => {
    const embedded = (r as unknown as Record<string, StatRow["matches"]>)[matchesTable];
    return { ...r, game_duration_seconds: embedded?.game_duration_seconds ?? 0 };
  });
}

/** Pure — the Map is built here rather than inside anything cached. */
export function buildChampionPool(
  statRows: ChampionStatInput[],
  playerId: string,
): ChampionAgg[] {
  return allChampionsByPlayer(statRows).get(playerId) ?? [];
}
