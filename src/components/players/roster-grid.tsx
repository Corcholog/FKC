import Link from "next/link";
import { formatKdaRatio } from "@/lib/format";
import { formatRole } from "@/lib/roles";
import { avatarTint } from "@/lib/avatar-tint";
import type { ChampionInfo } from "@/lib/ddragon";
import type { ChampionAgg } from "@/lib/champion-stats";
import { kdaRatio, playerWinRate, type PlayerAgg } from "@/lib/player-stats";
import type { TeamMember } from "@/lib/team/roster";
import type { SourceName } from "@/lib/scope";
import { DEFAULT_SOURCE } from "@/lib/scope";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChampionIcon } from "@/components/champion-icon";
import { RankBadge } from "@/components/rank-badge";
import { winRateTone } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// The roster — /players.
//
// Five cards in role order, which is the whole page. It replaced two things: the
// rank-sorted grid at /roster, and the navigation rail that used to sit down the
// left of /team/players. Rank order was the right sort while this app was about
// nine friends climbing; role order is the right one for a team, and it is also
// the only order in which a missing player is visible as a gap.
//
// A card renders for somebody with no games in the selected source rather than
// vanishing, which is the point of reading the roster rather than the rows:
// "our support has played nothing this split" is information.

export type PlayerCardData = {
  member: TeamMember;
  /** Their soloQ rank, mirrored onto `players` from the best of their accounts. */
  rank: { tier: string | null; division: string | null; leaguePoints: number | null };
  agg: PlayerAgg | undefined;
  top: ChampionAgg[];
};

export function playerHref(slug: string, source: SourceName): string {
  return source === DEFAULT_SOURCE ? `/players/${slug}` : `/players/${slug}?source=${source}`;
}

export function RosterGrid({
  cards,
  source,
  version,
  championMap,
}: {
  cards: PlayerCardData[];
  /** Carried into each link, so the switch survives a click through to a player. */
  source: SourceName;
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(({ member, rank, agg, top }) => {
        const winRate = agg ? playerWinRate(agg) : 0;

        return (
          <Link
            key={member.id}
            href={playerHref(member.slug, source)}
            className="panel-hex flex flex-col gap-3 p-4 transition-colors hover:bg-bg-tertiary/40"
          >
            <div className="flex items-center gap-3">
              <Avatar>
                {member.avatar_url && <AvatarImage src={member.avatar_url} alt="" />}
                <AvatarFallback style={avatarTint(member.display_name)}>
                  {member.display_name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{member.display_name}</p>
                <p className="truncate text-[10px] font-semibold tracking-wider text-grey-mid uppercase">
                  {formatRole(member.team_role)}
                </p>
              </div>

              <RankBadge
                tier={rank.tier}
                division={rank.division}
                leaguePoints={rank.leaguePoints}
                size="sm"
              />
            </div>

            <div className="flex items-end justify-between gap-3">
              <div className="flex gap-1">
                {top.slice(0, 3).map((champion) => (
                  <ChampionIcon
                    key={champion.championId}
                    championId={champion.championId}
                    championName={champion.championName}
                    version={version}
                    championMap={championMap}
                    size="sm"
                  />
                ))}
              </div>

              <div className="shrink-0 text-right">
                {agg && agg.games > 0 ? (
                  <>
                    <p className={cn("text-sm font-semibold tabular-nums", winRateTone(winRate))}>
                      {winRate}%
                    </p>
                    <p className="text-[10px] tabular-nums text-grey-mid">
                      {agg.games}g · {formatKdaRatio(kdaRatio(agg))}
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-grey-mid">No games</p>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
