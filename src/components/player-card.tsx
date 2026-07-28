import Link from "next/link";
import Image from "next/image";
import { formatRank, formatWinLoss, formatWinRate } from "@/lib/rank";

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

export function PlayerCard({ player }: { player: Player }) {
  return (
    <Link
      href={`/player/${player.id}`}
      className="flex items-center gap-4 rounded-lg border border-border bg-bg-secondary p-4 transition-colors hover:bg-bg-tertiary"
    >
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

      <div className="flex-1">
        <p className="font-medium text-white">{player.display_name}</p>
        <p className="text-xs text-grey-light">
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

      <div className="text-right">
        <p className="tabular-nums font-semibold text-white">
          {formatWinLoss(player.wins, player.losses)}
        </p>
        <p className="tabular-nums text-xs text-grey-light">{formatWinRate(player.wins, player.losses)}</p>
      </div>
    </Link>
  );
}
