import {
  MIN_SIDE_GAMES,
  sideAverageMinutes,
  sideWinRate,
  type SideSplit as SideSplitAgg,
} from "@/lib/side-stats";

// Blue vs red. Two rows, and a caption that undersells it on purpose.
//
// In soloq the side is dealt to you, so any gap here is a coin landing unevenly
// until the sample is genuinely large — printing it next to CS/min and vision
// score without saying so would invite a coach to read a pattern into noise. The
// same component over scrim rows means something entirely different, which is
// why the caveat lives here in the view rather than in lib/side-stats.ts.
export function SideSplit({ split }: { split: SideSplitAgg }) {
  const sides = [split.blue, split.red];
  const totalGames = sides.reduce((sum, s) => sum + s.games, 0);

  if (totalGames === 0) {
    return <p className="text-sm text-grey-mid">No tracked matches yet.</p>;
  }

  const enough = totalGames >= MIN_SIDE_GAMES;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {sides.map((agg) => {
          const share = agg.games === 0 ? 0 : Math.round((agg.games / totalGames) * 100);
          const winRate = sideWinRate(agg);

          return (
            <li key={agg.side} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-white capitalize">{agg.side} side</span>
                <span className="tabular-nums text-xs text-grey-light">
                  {agg.games === 0 ? (
                    <span className="text-grey-mid">no games</span>
                  ) : (
                    <>
                      {agg.games}g · {winRate}% WR ·{" "}
                      {sideAverageMinutes(agg).toFixed(0)} min avg
                    </>
                  )}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
                {agg.games > 0 && (
                  <div
                    className={`h-full rounded-full ${winRate >= 50 ? "bg-win/70" : "bg-loss/70"}`}
                    style={{ width: `${Math.max(share, 2)}%` }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!enough && (
        <p className="text-xs text-grey-mid">
          Under {MIN_SIDE_GAMES} games — the split is still mostly chance.
        </p>
      )}
    </div>
  );
}
