import Link from "next/link";
import { recordByOpponent } from "@/lib/scrims/team-stats";
import type { ScrimGameView, ScrimOpponentRow } from "@/lib/scrims/types";
import { cn } from "@/lib/utils";

// The opponent index — /scrims/opponents and its demo.
//
// Every team name here comes from demo_scrim_opponents on the public side, so
// the view has nothing to hide; basePath is the only thing it takes beyond data.
export function ScrimOpponentsView({
  games,
  opponents,
  basePath = "",
}: {
  games: ScrimGameView[];
  opponents: ScrimOpponentRow[];
  basePath?: string;
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
            href={`${basePath}/scrims/opponents/${opponent.slug}`}
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
