// Everything /players needs: the five, and every game each of them played.
//
// Three records, one row shape. Solo queue and flex are Riot participant rows;
// team matches are typed picks. `unified.ts` turns all three into a row shaped
// like `match_participants`, so the page folds them with `allChampionsByPlayer`
// and `aggregatePlayerStats` unchanged and never learns where a row came from
// (ADR-046).
//
// Fetch/build split as everywhere else in this folder: what comes back here is
// plain arrays.

import { fetchAllByIds } from "@/lib/supabase/fetch-all";
import type { DataSource } from "@/lib/data-source";
import type { QueueScope } from "@/lib/data-source";
import { loadTeamGames } from "@/lib/team/queries";
import type { TeamGameView } from "@/lib/team/types";
import { fromParticipant, fromTeamGames, type ParticipantInput, type UnifiedRow } from "@/lib/unified";
import type { StatSource } from "@/lib/scope";

const PARTICIPANT_COLUMNS =
  "player_id, team_position, champion_id, champion_name, win, kills, deaths, assists, " +
  "total_cs, damage_dealt_to_champions, gold_earned, vision_score";

type ParticipantRow = Omit<ParticipantInput, "game_creation" | "game_duration_seconds">;

type MatchEmbed = { game_creation: string; game_duration_seconds: number } | null;

/**
 * One queue's participant rows for a set of players.
 *
 * `fetchAllByIds` rather than a plain `.in()`: PostgREST truncates at the
 * project's Max rows silently, and five players' soloQ history passes a
 * thousand rows inside a season. A short read here would not error — it would
 * quietly shrink somebody's champion pool.
 */
async function fetchQueueRows(
  source: DataSource,
  playerIds: string[],
): Promise<UnifiedRow[]> {
  if (playerIds.length === 0) return [];
  const matchesTable = source.table("matches");

  const raw = await fetchAllByIds<ParticipantRow>(playerIds, (chunk, from, to) =>
    source.supabase
      .from(source.table("match_participants"))
      .select(`id, ${PARTICIPANT_COLUMNS}, ${matchesTable}!inner(game_creation, game_duration_seconds)`)
      .in("player_id", chunk)
      // A total order, so `.range()` paging can't overlap or skip — the same
      // trap lib/team/queries.ts documents.
      .order("player_id")
      .order("id")
      .range(from, to)
      .returns<ParticipantRow[]>(),
  );

  const out: UnifiedRow[] = [];
  for (const row of raw) {
    const embedded = (row as unknown as Record<string, MatchEmbed>)[matchesTable];
    // Unreachable through the inner join; the types don't know that.
    if (!embedded) continue;
    out.push(
      fromParticipant(
        {
          ...row,
          game_creation: embedded.game_creation,
          game_duration_seconds: embedded.game_duration_seconds,
        },
        source.queue === "flex" ? "flexq" : "soloq",
      ),
    );
  }
  return out;
}

export type PlayerRecordRows = Record<StatSource, UnifiedRow[]>;

/**
 * Takes a source *factory* rather than a client, because this loader needs three
 * differently-scoped sources, and the page should not have to remember which
 * queue goes where.
 */
export async function fetchPlayerRecordRows(
  makeSource: (queue: QueueScope) => DataSource,
  playerIds: string[],
  /**
   * Team games the caller already has.
   *
   * `/` renders the team's own record from the same set, and the team-match read
   * is four round trips (lib/team/queries.ts) — so a page that needs both would
   * otherwise pay for them twice. Omitted, this loads them itself.
   */
  preloadedGames?: TeamGameView[],
): Promise<PlayerRecordRows> {
  const [soloq, flexq, games] = await Promise.all([
    fetchQueueRows(makeSource("solo"), playerIds),
    fetchQueueRows(makeSource("flex"), playerIds),
    preloadedGames ?? loadTeamGames(makeSource("solo")),
  ]);

  return {
    soloq,
    flexq,
    // Ally picks only. An enemy pick belongs to somebody we are scouting, and
    // its `player_id` is null anyway — but saying so here is cheaper than
    // wondering later why the numbers look doubled.
    team: fromTeamGames(games, { allies: true }),
  };
}
