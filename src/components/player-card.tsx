import Link from "next/link";
import Image from "next/image";
import { formatRank, formatWinLoss, formatWinRate, rankTierColor } from "@/lib/rank";
import { formatPerMinute } from "@/lib/format";
import { championDisplayName, championIconUrl, type ChampionInfo } from "@/lib/ddragon";
import { championWinRate, type ChampionAgg } from "@/lib/champion-stats";

type Player = {
  id: string;
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

function ChampionChip({
  champ,
  version,
  championMap,
}: {
  champ: ChampionAgg;
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  const url = championIconUrl(champ.championId, version, championMap);
  const name = championDisplayName(champ.championId, championMap, champ.championName);
  const winRate = championWinRate(champ);

  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-md bg-bg-tertiary px-1.5 py-2">
      {url ? (
        <img src={url} alt={name} title={name} className="h-6 w-6 rounded-sm" />
      ) : (
        <div className="h-6 w-6 rounded-sm bg-blue-muted" />
      )}
      <p className="tabular-nums text-xs text-white">
        {winRate}% <span className="text-grey-mid">({champ.games})</span>
      </p>
      <p className="hidden tabular-nums text-[10px] text-grey-light sm:block">
        {formatPerMinute(champ.totalCs, champ.totalDurationSeconds)} CS/min
      </p>
      <p className="hidden tabular-nums text-[10px] text-grey-light sm:block">
        {formatPerMinute(champ.totalDamage, champ.totalDurationSeconds)} dmg/min
      </p>
    </div>
  );
}

export function PlayerCard({
  player,
  topChampions,
  version,
  championMap,
}: {
  player: Player;
  topChampions: ChampionAgg[];
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  return (
    <Link
      href={`/player/${player.id}`}
      style={{ borderColor: rankTierColor(player.tier) }}
      className="flex flex-col gap-3 rounded-lg border-2 bg-bg-secondary p-4 transition-colors hover:bg-bg-tertiary"
    >
      <div className="flex items-center gap-4">
        {player.avatar_url ? (
          <Image
            src={player.avatar_url}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-blue-muted" />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-white">{player.display_name}</p>
          <p className="truncate text-xs text-grey-light">
            {player.riot_game_name}#{player.riot_tag_line}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded-full bg-blue-muted px-2 py-0.5 text-xs text-white">
              {formatRank(player.tier, player.division)}
            </span>
            {player.tier && (
              <span className="tabular-nums text-xs text-grey-light">{player.league_points ?? 0} LP</span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="tabular-nums font-semibold text-white">
            {formatWinLoss(player.wins, player.losses)}
          </p>
          <p className="tabular-nums text-xs text-grey-light">{formatWinRate(player.wins, player.losses)}</p>
        </div>
      </div>

      {topChampions.length > 0 && (
        <div className="flex gap-1.5 border-t border-border pt-3">
          {topChampions.map((c) => (
            <ChampionChip key={c.championId} champ={c} version={version} championMap={championMap} />
          ))}
        </div>
      )}
    </Link>
  );
}
