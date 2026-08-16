import {
  durationWinRate,
  type DurationBucketAgg,
} from "@/lib/duration-stats";

// Winrate by how long the game ran. Same shape as RoleSplit, and for the same
// reason: bar length is the share of games in that bucket, colour is the
// winrate. Encoding winrate as length instead would draw a 3-game bucket at 33%
// exactly as confidently as a 70-game one, and the thin buckets here are always
// the long games — the ones the reader is most interested in and least able to
// trust.
export function DurationSplit({ buckets }: { buckets: DurationBucketAgg[] }) {
  const played = buckets.filter((b) => b.games > 0);

  if (played.length === 0) {
    return <p className="text-sm text-grey-mid">No tracked matches yet.</p>;
  }

  const totalGames = played.reduce((sum, b) => sum + b.games, 0);

  return (
    <ul className="flex flex-col gap-2">
      {buckets.map((bucket) => {
        const share = bucket.games === 0 ? 0 : Math.round((bucket.games / totalGames) * 100);
        const winRate = durationWinRate(bucket);

        return (
          <li key={bucket.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className={bucket.games === 0 ? "text-grey-mid" : "text-white"}>
                {bucket.label}
              </span>
              <span className="tabular-nums text-xs text-grey-light">
                {bucket.games === 0 ? (
                  // Kept rather than filtered out: "they have never played a
                  // 35-minute game" is itself the answer to the question this
                  // list asks, and an absent row reads as an unasked question.
                  <span className="text-grey-mid">no games</span>
                ) : (
                  <>
                    {bucket.games}g · {winRate}% WR · {bucket.wins}W{" "}
                    {bucket.games - bucket.wins}L
                  </>
                )}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
              {bucket.games > 0 && (
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
  );
}
