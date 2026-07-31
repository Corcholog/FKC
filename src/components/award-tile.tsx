"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatRankingDialog, type RankRow, type RankTone } from "@/components/stat-ranking";
import { cn } from "@/lib/utils";

export type AwardPlayer = {
  slug: string;
  display_name: string;
  avatar_url: string | null;
};

const TONE_CLASS: Record<RankTone, string> = {
  good: "text-win",
  bad: "text-loss",
  neutral: "text-white",
};

export function AwardTile({
  label,
  player,
  value,
  sub,
  tone = "neutral",
  metric,
  ranking,
}: {
  label: string;
  player: AwardPlayer | null;
  value: string;
  sub?: string;
  tone?: RankTone;
  /** One line on what the number measures — the dialog's subtitle. */
  metric: string;
  /** Everyone who qualifies for this award, best-first. Row 0 is the winner shown here. */
  ranking: RankRow[];
}) {
  const [open, setOpen] = useState(false);

  const body = (
    <>
      <p className="text-[11px] tracking-wide text-grey-light uppercase">{label}</p>

      <p className={`font-heading tabular-nums text-2xl font-semibold ${TONE_CLASS[tone]}`}>
        {player ? value : "—"}
      </p>

      {player ? (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar size="sm">
            {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
            <AvatarFallback className="text-[10px]">
              {player.display_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="min-w-0 truncate text-sm text-white">{player.display_name}</p>
        </div>
      ) : (
        <p className="text-sm text-grey-mid">No games yet</p>
      )}

      {player && sub && <p className="tabular-nums text-xs text-grey-mid">{sub}</p>}
    </>
  );

  const className = "panel-hex panel-hex-clip flex flex-col items-start gap-1 p-3";

  // Unclaimed awards stay inert — there is no ranking to open behind an em dash.
  if (!player) return <div className={className}>{body}</div>;

  // The tile used to link to the winner's player page. It opens the standings
  // instead: the winner is already named on the tile, and the question a tile
  // actually provokes is where everyone *else* landed. Each row in the dialog
  // still links through to its player.
  //
  // panel-hex's hover glow is keyed on `a.panel-hex:hover` plus the explicit
  // `.is-interactive` opt-in — a button needs the latter.
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(className, "is-interactive cursor-pointer text-left")}
      >
        {body}
      </button>

      <StatRankingDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        description={metric}
        rows={ranking}
        tone={tone}
      />
    </>
  );
}
