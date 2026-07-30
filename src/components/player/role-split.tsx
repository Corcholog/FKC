import { formatRole, sortByRole } from "@/lib/roles";
import { csPerMinute, kdaRatio, playerWinRate, type PlayerAgg } from "@/lib/player-stats";
import { formatKdaRatio } from "@/lib/format";

// How the player's games split across the five roles, and how each one goes.
// Riot's team_position is already stored on every row — until now it was only
// used to order team comps.
export function RoleSplit({ byRole }: { byRole: Map<string, PlayerAgg> }) {
  const entries = sortByRole(
    [...byRole.entries()].map(([team_position, agg]) => ({ team_position, agg })),
  ).filter((entry) => entry.agg.games > 0);

  if (entries.length === 0) {
    return <p className="text-sm text-grey-mid">No tracked matches yet.</p>;
  }

  const totalGames = entries.reduce((sum, e) => sum + e.agg.games, 0);

  return (
    <ul className="flex flex-col gap-2">
      {entries.map(({ team_position, agg }) => {
        const share = Math.round((agg.games / totalGames) * 100);
        const winRate = playerWinRate(agg);

        return (
          <li key={team_position ?? "unknown"} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-white">{formatRole(team_position)}</span>
              <span className="tabular-nums text-xs text-grey-light">
                {agg.games}g · {winRate}% WR · {formatKdaRatio(kdaRatio(agg))} KDA
                {agg.csGames > 0 && ` · ${csPerMinute(agg).toFixed(1)} CS/m`}
              </span>
            </div>
            {/* Bar length is share of games played, not winrate — the point of
                this list is which roles they actually queue for. */}
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
              <div
                className={`h-full rounded-full ${winRate >= 50 ? "bg-win/70" : "bg-loss/70"}`}
                style={{ width: `${Math.max(share, 2)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
