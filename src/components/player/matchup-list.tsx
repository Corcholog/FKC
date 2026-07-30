import Image from "next/image";
import { championDisplayName, championIconUrl, type ChampionInfo } from "@/lib/ddragon";
import { matchupWinRate, type MatchupAgg } from "@/lib/matchups";
import { formatKdaRatio } from "@/lib/format";

// Lane matchups — the tracked player's record against each enemy champion they
// were laned against. Built from the enemy participant rows that were already
// being stored and never aggregated anywhere until now.
export function MatchupList({
  matchups,
  version,
  championMap,
  limit = 8,
}: {
  matchups: MatchupAgg[];
  version: string;
  championMap: Map<number, ChampionInfo>;
  limit?: number;
}) {
  if (matchups.length === 0) {
    return (
      <p className="text-sm text-grey-mid">
        No lane matchups yet — Riot only reports a lane when it can work out both roles.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {matchups.slice(0, limit).map((matchup) => {
        const winRate = matchupWinRate(matchup);
        const icon = championIconUrl(matchup.championId, version, championMap);
        const name = championDisplayName(matchup.championId, championMap, matchup.championName);
        const kda = (matchup.kills + matchup.assists) / Math.max(matchup.deaths, 1);

        return (
          <li
            key={matchup.championId}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-bg-tertiary"
          >
            {icon ? (
              <Image src={icon} alt="" width={24} height={24} className="rounded shrink-0" />
            ) : (
              <span className="h-6 w-6 shrink-0 rounded bg-bg-tertiary" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-white">{name}</span>
            <span className="shrink-0 text-xs tabular-nums text-grey-mid">
              {formatKdaRatio(kda)} KDA
            </span>
            <span
              className={`w-16 shrink-0 text-right text-sm tabular-nums font-medium ${
                winRate >= 50 ? "text-win" : "text-loss"
              }`}
            >
              {matchup.wins}W {matchup.games - matchup.wins}L
            </span>
          </li>
        );
      })}
    </ul>
  );
}
