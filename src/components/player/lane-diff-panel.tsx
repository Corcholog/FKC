import {
  csDiffPerMinute,
  damageDiffPerMinute,
  goldDiffPerMinute,
  MIN_LANE_DIFF_GAMES,
  type LaneDiffAgg,
} from "@/lib/lane-diff";

// Gold, CS and damage against the enemy in the same role, per minute.
//
// Three numbers on one row, each signed. The sign is the whole content — "+42
// gold/min" and "-42 gold/min" describe opposite players — so it is spelled out
// with an explicit + and coloured, rather than left to a minus sign the eye
// skips.
function DiffFigure({
  label,
  value,
  precision,
  caption,
}: {
  label: string;
  value: number;
  precision: number;
  caption: string;
}) {
  const ahead = value >= 0;
  const sign = ahead ? "+" : "−";

  return (
    <div className="flex flex-1 flex-col gap-0.5 rounded-lg bg-bg-tertiary px-3 py-2">
      <p className="text-xs text-grey-light">{label}</p>
      <p className={`tabular-nums text-lg font-semibold ${ahead ? "text-win" : "text-loss"}`}>
        {sign}
        {Math.abs(value).toFixed(precision)}
      </p>
      <p className="text-[10px] text-grey-mid">{caption}</p>
    </div>
  );
}

export function LaneDiffPanel({ agg }: { agg: LaneDiffAgg }) {
  if (agg.games === 0) {
    return (
      <p className="py-6 text-center text-sm text-grey-mid">
        No games yet where Riot recorded a role for both laners.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <DiffFigure label="Gold" value={goldDiffPerMinute(agg)} precision={0} caption="per minute" />
        <DiffFigure label="CS" value={csDiffPerMinute(agg)} precision={2} caption="per minute" />
        <DiffFigure
          label="Damage"
          value={damageDiffPerMinute(agg)}
          precision={0}
          caption="to champions, per minute"
        />
      </div>

      <p className="text-xs text-grey-mid">
        Against the enemy in the same role, over {agg.games} games where Riot assigned one.
        {agg.games < MIN_LANE_DIFF_GAMES && " Too few to read as a trend yet."}
      </p>
    </div>
  );
}
