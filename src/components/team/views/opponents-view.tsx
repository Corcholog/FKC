import Link from "next/link";
import { recordByOpponent } from "@/lib/team/stats";
import type { TeamGameView, TeamOpponentRow } from "@/lib/team/types";
import { cn } from "@/lib/utils";

// The opponent index — /prep/opponents.
//
// Takes nothing beyond its data.
export function TeamOpponentsView({
  games,
  opponents,
}: {
  games: TeamGameView[];
  opponents: TeamOpponentRow[];
}) {
  const records = new Map(recordByOpponent(games).map((r) => [r.opponentId, r]));

  return (
    <div className="flex flex-col gap-2">
      {/* Every opponent, including ones created but never played — a team added
          while setting up a series shouldn't vanish from the list. */}
      {opponents.map((opponent) => {
        const record = records.get(opponent.id);
        const wins = record?.record.wins ?? 0;
        const losses = record?.record.losses ?? 0;

        return (
          <Link
            key={opponent.id}
            href={`/prep/opponents/${opponent.slug}`}
            className="panel-hex is-interactive flex flex-wrap items-center gap-3 px-4 py-3"
          >
            <span className="font-medium text-white">{opponent.name}</span>
            {record ? (
              <>
                <span className="text-xs text-grey-mid">
                  {record.seriesCount} series · last {record.lastPlayed}
                </span>
                <span
                  className={cn(
                    "ml-auto font-heading text-sm font-semibold tabular-nums",
                    wins > losses ? "text-win" : wins < losses ? "text-loss" : "text-grey-light",
                  )}
                >
                  {wins}–{losses}
                </span>
                <span className="w-12 text-right text-xs text-grey-mid tabular-nums">
                  {record.record.winRate}%
                </span>
              </>
            ) : (
              <span className="ml-auto text-xs text-grey-mid">No games yet</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
