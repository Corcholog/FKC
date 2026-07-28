import Link from "next/link";
import Image from "next/image";
import { formatDuration, formatKDA, formatPerMinute, formatRelativeTime } from "@/lib/format";
import { championDisplayName, championIconUrl, type ChampionInfo } from "@/lib/ddragon";

export type TeamComposChampion = {
  championId: number;
  championName: string;
  isSelf?: boolean;
};

type MatchRowData = {
  matchId: string;
  championId: number;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damageDealtToChampions: number;
  totalCs: number;
  gameCreation: string;
  gameDurationSeconds: number;
  opponent: TeamComposChampion | null;
  allies: TeamComposChampion[];
  enemies: TeamComposChampion[];
};

function TeamComposRow({
  champions,
  version,
  championMap,
}: {
  champions: TeamComposChampion[];
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  return (
    <div className="flex gap-1">
      {champions.map((c, i) => {
        const url = championIconUrl(c.championId, version, championMap);
        const name = championDisplayName(c.championId, championMap, c.championName);
        return url ? (
          // eslint-disable-next-line @next/next/no-img-element -- many tiny decorative
          // icons per row; next/image's optimizer overhead isn't worth it at this size.
          <img
            key={i}
            src={url}
            alt={name}
            title={name}
            className={`h-7 w-7 rounded-sm ${c.isSelf ? "ring-2 ring-blue-bright" : ""}`}
          />
        ) : (
          <div key={i} className="h-7 w-7 rounded-sm bg-blue-muted" />
        );
      })}
    </div>
  );
}

export function MatchRow({
  match,
  version,
  championMap,
  playerId,
}: {
  match: MatchRowData;
  version: string;
  championMap: Map<number, ChampionInfo>;
  playerId: string;
}) {
  const iconUrl = championIconUrl(match.championId, version, championMap);
  const displayName = championDisplayName(match.championId, championMap, match.championName);
  const opponentIconUrl = match.opponent ? championIconUrl(match.opponent.championId, version, championMap) : null;
  const opponentName = match.opponent
    ? championDisplayName(match.opponent.championId, championMap, match.opponent.championName)
    : null;

  return (
    <Link
      href={`/player/${playerId}/match/${match.matchId}`}
      className={`flex items-center gap-3 rounded-lg border-l-4 bg-bg-secondary p-3 transition-colors hover:bg-bg-tertiary ${
        match.win ? "border-l-win" : "border-l-loss"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {iconUrl ? (
          <Image src={iconUrl} alt={displayName} width={40} height={40} className="h-10 w-10 shrink-0 rounded-md" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-md bg-blue-muted" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{displayName}</p>
          <p className="tabular-nums text-xs text-grey-light">
            {formatKDA(match.kills, match.deaths, match.assists)}
          </p>
        </div>
      </div>

      {/* Compact opponent hint on narrow screens, where the full team comps below don't fit. */}
      <div className="flex w-16 shrink-0 flex-row items-center justify-center gap-1.5 md:hidden">
        <span className="text-xs font-medium tracking-wide text-grey-mid uppercase">vs</span>
        {opponentIconUrl ? (
          <img src={opponentIconUrl} alt={opponentName ?? ""} title={opponentName ?? ""} className="h-7 w-7 rounded-sm" />
        ) : (
          <div className="h-7 w-7 rounded-sm bg-blue-muted" />
        )}
      </div>

      {/* Full team comps once there's room — replaces the "vs" hint above, not alongside it. */}
      <div className="hidden shrink-0 flex-col items-center justify-center gap-1 md:flex">
        <TeamComposRow champions={match.allies} version={version} championMap={championMap} />
        <TeamComposRow champions={match.enemies} version={version} championMap={championMap} />
      </div>

      <div className="hidden w-28 shrink-0 text-right text-xs text-grey-light sm:block">
        <p className="tabular-nums">{formatPerMinute(match.totalCs, match.gameDurationSeconds)} CS/min</p>
        <p className="tabular-nums">
          {formatPerMinute(match.damageDealtToChampions, match.gameDurationSeconds)} dmg/min
        </p>
        <p className="tabular-nums">{formatDuration(match.gameDurationSeconds)}</p>
      </div>

      <div className="w-24 shrink-0 text-right">
        <p className={`text-sm font-semibold ${match.win ? "text-win" : "text-loss"}`}>
          {match.win ? "Win" : "Loss"}
        </p>
        <p className="text-xs text-grey-mid">{formatRelativeTime(match.gameCreation)}</p>
      </div>
    </Link>
  );
}
