"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { avatarTint } from "@/lib/avatar-tint";
import { cn } from "@/lib/utils";

// The answer to "why didn't I win that award?".
//
// Every headline number in the app — an award tile, an hour's bar, a point on
// a curve — is the top of an ordered list that was thrown away on the way to
// rendering it. This dialog is that list: every contender, in order, with the
// value that put them there and the sample size behind it. A tooltip can only
// tell you who won; this tells you where you came.

export type RankRow = {
  id: string;
  name: string;
  /** Already formatted — the caller owns the metric's units and precision. */
  value: string;
  /** Sample size or record, so a leader off two games is visibly a leader off two games. */
  sub?: string;
  /** Present (even as null) on rows that are players; omitted on rows that aren't. */
  avatarUrl?: string | null;
  href?: string;
  /** Listed but not numbered — below whatever sample-size gate the metric has. */
  unranked?: boolean;
  /** The row the click came from, so "where am I in this" is findable at a glance. */
  highlight?: boolean;
};

export type RankTone = "good" | "bad" | "neutral";

// Only the leader is tinted, and in the same colour as the tile that opened the
// dialog — so "worst KDA" opens on a red number at rank 1 and reads as the same
// statement, not as a mistake.
const LEADER_TONE: Record<RankTone, string> = {
  good: "text-win",
  bad: "text-loss",
  neutral: "text-white",
};

function RankingRow({
  row,
  rank,
  tone,
  showAvatar,
}: {
  row: RankRow;
  /** Null on rows that are shown but not ranked. */
  rank: number | null;
  tone: RankTone;
  showAvatar: boolean;
}) {
  const body = (
    <>
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-grey-mid">
        {rank ?? "–"}
      </span>

      {showAvatar && (
        <Avatar size="sm">
          {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
          <AvatarFallback className="text-[10px]" style={avatarTint(row.name)}>
            {row.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      <span className="min-w-0 flex-1 truncate text-sm text-white">{row.name}</span>

      <span className="shrink-0 text-right">
        <span
          className={cn(
            "block tabular-nums text-sm font-medium",
            rank === 1 ? LEADER_TONE[tone] : "text-white",
          )}
        >
          {row.value}
        </span>
        {row.sub && <span className="block tabular-nums text-[11px] text-grey-mid">{row.sub}</span>}
      </span>
    </>
  );

  const className = cn(
    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
    row.highlight && "bg-gold-muted/20 ring-1 ring-gold/40",
    // Only rows that go somewhere get a hover state — an inert row that lights
    // up reads as a dead link.
    row.href && "hover:bg-bg-tertiary",
  );

  if (!row.href) return <div className={className}>{body}</div>;

  return (
    <Link href={row.href} className={className}>
      {body}
    </Link>
  );
}

export function StatRankingDialog({
  open,
  onOpenChange,
  title,
  description,
  rows,
  tone = "neutral",
  empty = "Nothing to rank yet.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What the number actually measures. The dialog is where that gets said plainly. */
  description: string;
  rows: RankRow[];
  tone?: RankTone;
  empty?: string;
}) {
  // Player rows carry an avatarUrl key (null included, for the initials
  // fallback); rows for hour slots and duo pairs don't, and shouldn't reserve
  // the column.
  const showAvatars = rows.some((row) => "avatarUrl" in row);

  // Numbered ahead of the render rather than inside it, so unranked rows can be
  // skipped in the count without the map having to carry a running total.
  const numbered: { row: RankRow; rank: number | null }[] = [];
  let position = 0;
  for (const row of rows) {
    if (!row.unranked) position += 1;
    numbered.push({ row, rank: row.unranked ? null : position });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Clears the absolutely-positioned close button in the corner. */}
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {numbered.length === 0 ? (
          <p className="py-4 text-center text-sm text-grey-mid">{empty}</p>
        ) : (
          // Negative margin plus matching padding so a highlighted row's ring
          // isn't clipped by the scroll container's edge.
          <ul className="-mx-1 flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto px-1">
            {numbered.map(({ row, rank }) => (
              <li key={row.id}>
                <RankingRow row={row} rank={rank} tone={tone} showAvatar={showAvatars} />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
