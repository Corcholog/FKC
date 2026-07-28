import Link from "next/link";
import Image from "next/image";
import { formatDuration, formatKDA, formatRelativeTime } from "@/lib/format";
import { championIconUrl } from "@/lib/ddragon";

type MatchRowData = {
  matchId: string;
  championId: number;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damageDealtToChampions: number;
  goldEarned: number;
  totalCs: number;
  gameCreation: string;
  gameDurationSeconds: number;
};

export function MatchRow({
  match,
  version,
  championMap,
  playerId,
}: {
  match: MatchRowData;
  version: string;
  championMap: Map<number, string>;
  playerId: string;
}) {
  const iconUrl = championIconUrl(match.championId, version, championMap);

  return (
    <Link
      href={`/player/${playerId}/match/${match.matchId}`}
      className={`flex items-center gap-3 rounded-lg border-l-4 bg-bg-secondary p-3 transition-colors hover:bg-bg-tertiary ${
        match.win ? "border-l-win" : "border-l-loss"
      }`}
    >
      {iconUrl ? (
        <Image src={iconUrl} alt={match.championName} width={40} height={40} className="h-10 w-10 rounded-md" />
      ) : (
        <div className="h-10 w-10 rounded-md bg-blue-muted" />
      )}

      <div className="flex-1">
        <p className="text-sm font-medium text-white">{match.championName}</p>
        <p className="tabular-nums text-xs text-grey-light">
          {formatKDA(match.kills, match.deaths, match.assists)}
        </p>
      </div>

      <div className="hidden text-right text-xs text-grey-light sm:block">
        <p className="tabular-nums">{match.damageDealtToChampions.toLocaleString()} dmg</p>
        <p className="tabular-nums">{match.goldEarned.toLocaleString()} gold</p>
      </div>

      <div className="hidden text-right text-xs text-grey-light sm:block">
        <p className="tabular-nums">{match.totalCs} CS</p>
        <p className="tabular-nums">{formatDuration(match.gameDurationSeconds)}</p>
      </div>

      <div className="text-right">
        <p className={`text-sm font-semibold ${match.win ? "text-win" : "text-loss"}`}>
          {match.win ? "Win" : "Loss"}
        </p>
        <p className="text-xs text-grey-mid">{formatRelativeTime(match.gameCreation)}</p>
      </div>
    </Link>
  );
}
