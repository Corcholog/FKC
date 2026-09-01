// The tier list overview — /prep/tierlists.
//
// Same fetch/build split as the rest of this folder.

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { rows } from "@/lib/supabase/read";
import type { DataSource } from "@/lib/data-source";
import { allChampionsByPlayer, type ChampionStatInput } from "@/lib/champion-stats";
import { LOLALYTICS_LANES, mainLane } from "@/lib/lolalytics";
import {
  normalizeTiers,
  statMap,
  type Tier,
  type TierChampionStat,
} from "@/lib/tierlist";

export type TierListsPlayer = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  user_id?: string | null;
};

export type TierListRecord = {
  player_id: string;
  tiers: unknown;
  updated_at: string;
  updated_by?: string | null;
};

type StatRow = Omit<ChampionStatInput, "game_duration_seconds"> & {
  team_position: string | null;
  matches: { game_duration_seconds: number } | null;
};

/** A stat row with the embed flattened and the position kept for the lane sort. */
export type TierListStatRow = ChampionStatInput & { team_position: string | null };

export type TierListsRows = {
  players: TierListsPlayer[];
  lists: TierListRecord[];
  statRows: TierListStatRow[];
  /**
   * Carried with the rows rather than passed to `buildTierLists` separately, so
   * a page cannot forget it. Forgetting would publish the real tier labels.
   */
};

const PLAYER_COLUMNS = "id, slug, display_name, avatar_url";

export async function fetchTierListsRows(source: DataSource): Promise<TierListsRows> {
  const matchesTable = source.table("matches");

  // Everyone with a login, not the whole roster: a tier list is somebody's
  // opinion, so it needs somebody to hold it.
  const playerQuery = source.supabase
    .from(source.table("players"))
    .select(`${PLAYER_COLUMNS}, user_id`)
    .order("display_name")
    .not("user_id", "is", null);

  const [playersResult, listsResult, statRowRecords] = await Promise.all([
    playerQuery.returns<TierListsPlayer[]>(),
    source.supabase
      .from(source.table("champion_tier_lists"))
      .select("player_id, tiers, updated_at, updated_by")
      .returns<TierListRecord[]>(),
    // Hover stats for every listed player in one pass, the same shape
    // /champions builds for one. Paged: this select used to run bare, and a
    // silent Max rows truncation here would quietly delete the winrate chips
    // off the end of the roster rather than fail.
    fetchAllRows<StatRow>((from, to) =>
      source.supabase
        .from(source.table("match_participants"))
        .select(
          `player_id, team_position, champion_id, champion_name, win, kills, deaths, assists, total_cs, damage_dealt_to_champions, ${matchesTable}!inner(game_duration_seconds)`,
        )
        .not("player_id", "is", null)
        .range(from, to)
        .returns<StatRow[]>(),
    ),
  ]);

  const lists = rows(listsResult, "tier lists");
  const players = rows(playersResult, "players with logins");

  const statRows: TierListStatRow[] = statRowRecords.map((r) => {
    const embedded = (r as unknown as Record<string, StatRow["matches"]>)[matchesTable];
    return { ...r, game_duration_seconds: embedded?.game_duration_seconds ?? 0 };
  });

  return { players, lists, statRows };
}

export type TierListEntry = {
  player: TierListsPlayer;
  /** Null when this player has a login but hasn't made a list yet. */
  list: {
    tiers: Tier[];
    updatedAt: string;
    /** Null when nobody has edited it since the column was added. */
    editedBy: string | null;
  } | null;
  /** "Top", "Jungle", … — the lane they queue for most. */
  laneLabel: string;
  stats: Map<number, TierChampionStat>;
};

/**
 * Pure. Rows in, one entry per listed player out, in team order.
 *
 * `validChampionIds` is the key set from ddragon's getChampionMap(), which is
 * what keeps a stored list from mentioning a champion that no longer exists.
 */
export function buildTierLists(
  data: TierListsRows,
  validChampionIds: Set<number>,
): TierListEntry[] {
  const aggsByPlayer = allChampionsByPlayer(data.statRows);
  const listsByPlayer = new Map(data.lists.map((row) => [row.player_id, row]));

  // updated_by is an auth user id; the roster is the only place a name for it
  // exists.
  const nameByUserId = new Map(
    data.players.filter((p) => p.user_id).map((p) => [p.user_id as string, p.display_name]),
  );

  const positionsByPlayer = new Map<string, (string | null)[]>();
  for (const row of data.statRows) {
    if (!row.player_id) continue;
    const positions = positionsByPlayer.get(row.player_id) ?? [];
    positions.push(row.team_position);
    positionsByPlayer.set(row.player_id, positions);
  }
  const laneOf = (playerId: string) => mainLane(positionsByPlayer.get(playerId) ?? []);

  // Down the page in team order — Top, Jungle, Mid, ADC, Support — rather than
  // alphabetically, so the list reads like a roster. LOLALYTICS_LANES is already
  // in that order, so its index is the sort key; alphabetical is the tie-break.
  const laneRank = new Map(LOLALYTICS_LANES.map((lane, i) => [lane.value, i]));
  const laneLabel = new Map(LOLALYTICS_LANES.map((lane) => [lane.value, lane.label]));

  return [...data.players]
    .sort(
      (a, b) =>
        (laneRank.get(laneOf(a.id)) ?? 0) - (laneRank.get(laneOf(b.id)) ?? 0) ||
        a.display_name.localeCompare(b.display_name),
    )
    .map((player) => {
      const record = listsByPlayer.get(player.id);
      const tiers = record ? normalizeTiers(record.tiers, validChampionIds) : [];

      return {
        player,
        list: record
          ? {
              tiers,
              updatedAt: record.updated_at,
              editedBy: record.updated_by ? (nameByUserId.get(record.updated_by) ?? null) : null,
            }
          : null,
        laneLabel: laneLabel.get(laneOf(player.id)) ?? "",
        stats: statMap(aggsByPlayer.get(player.id) ?? []),
      };
    });
}
