import Link from "next/link";
import { rankTierColor } from "@/lib/rank";
import { formatWinLoss, formatWinRate } from "@/lib/rank";
import { formatPerMinute } from "@/lib/format";
import { championDisplayName, championIconUrl, type ChampionInfo } from "@/lib/ddragon";
import { championWinRate, type ChampionAgg } from "@/lib/champion-stats";
import { avatarTint } from "@/lib/avatar-tint";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { RankBadge } from "@/components/rank-badge";
import { WinrateRing } from "@/components/winrate-ring";

type Player = {
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
    <div className="flex flex-1 flex-col items-center gap-1 rounded-lg bg-bg-tertiary px-1.5 py-2">
      {url ? (
        <img src={url} alt={name} title={name} className="h-9 w-9 rounded-md" />
      ) : (
        <div className="h-9 w-9 rounded-md bg-gold-muted" />
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
  basePath = "",
}: {
  player: Player;
  topChampions: ChampionAgg[];
  version: string;
  championMap: Map<number, ChampionInfo>;
  /**
   * "" in the private app, "/demo" in the public one — the two render the same
   * card against different tables and differ only in where a click goes.
   *
   * `null` renders the card unlinked, for a surface where the player page
   * doesn't exist yet. A card that looks clickable and 404s is worse than one
   * that plainly isn't.
   */
  basePath?: string | null;
}) {
  const color = rankTierColor(player.tier);
  const totalGames = (player.wins ?? 0) + (player.losses ?? 0);
  const winRatePct = totalGames === 0 ? 0 : Math.round(((player.wins ?? 0) / totalGames) * 100);

  const card = (
      <Card
        style={
          {
            "--tier-color": color,
            borderColor: `color-mix(in oklch, ${color} 55%, transparent)`,
          } as React.CSSProperties
        }
        className="panel-hex-clip gap-3 border-2 shadow-[0_2px_10px_-6px_rgba(0,0,0,0.7)] transition-all duration-150 hover:bg-bg-tertiary hover:shadow-[0_0_18px_-4px_var(--tier-color)]"
      >
        <div className="flex items-center gap-4 px-4">
          <Avatar className="h-16 w-16">
            {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
            <AvatarFallback className="text-lg" style={avatarTint(player.display_name)}>
              {player.display_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-white">{player.display_name}</p>
            <p className="truncate text-xs text-grey-light">
              {player.riot_game_name}#{player.riot_tag_line}
            </p>
            <div className="mt-2">
              <RankBadge tier={player.tier} division={player.division} leaguePoints={player.league_points} size="lg" />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="tabular-nums text-lg font-semibold text-white">
                {formatWinLoss(player.wins, player.losses)}
              </p>
              <p className="tabular-nums text-sm text-grey-light">{formatWinRate(player.wins, player.losses)}</p>
            </div>
            <WinrateRing percentage={winRatePct} size={56} strokeWidth={5} />
          </div>
        </div>

        {topChampions.length > 0 && (
          <div className="flex gap-1.5 border-t border-border px-4 pt-3">
            {topChampions.map((c) => (
              <ChampionChip key={c.championId} champ={c} version={version} championMap={championMap} />
            ))}
          </div>
        )}
      </Card>
  );

  if (basePath === null) return card;
  return <Link href={`${basePath}/player/${player.slug}`}>{card}</Link>;
}
