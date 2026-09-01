// One player's team matches, as unified rows.
//
// Kept out of loaders/player.ts on purpose: that module knows the Riot tables
// and nothing else, and this needs the whole team-match read path. The player
// page joins the two.
//
// Same fetch/build split as its neighbours — this returns a plain array, so it
// holds no I/O.

import type { DataSource } from "@/lib/data-source";
import { loadTeamGames } from "@/lib/team/queries";
import { fromTeamPick, type UnifiedRow } from "@/lib/unified";

/**
 * Every ally pick this player made, across every recorded team match.
 *
 * Enemy picks are excluded, unlike lib/team/stats.ts's scouting aggregates:
 * this is one person's own record, and an enemy pick belongs to somebody else.
 *
 * Substitute picks with no `player_id` are excluded too, and that is a real
 * limitation rather than an oversight — a game entered with a nickname instead
 * of a roster link cannot be attributed, and guessing from the name would merge
 * two people who share one.
 */
export async function fetchPlayerTeamRows(
  source: DataSource,
  playerId: string,
): Promise<UnifiedRow[]> {
  const games = await loadTeamGames(source);

  const out: UnifiedRow[] = [];
  for (const game of games) {
    for (const pick of game.picks) {
      if (!pick.ally || pick.player_id !== playerId) continue;
      out.push(fromTeamPick(pick, game, game.series));
    }
  }
  return out;
}
