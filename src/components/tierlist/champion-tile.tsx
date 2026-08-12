"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TierChampion, TierChampionStat } from "@/lib/tierlist";
import { ChampionAvatar } from "@/components/champion-avatar";

// The PNG is captured from an off-screen node, and a responsive size class
// there would resolve against the *viewport*, so a tile would export at a
// different size from a phone than from a desktop. ChampionAvatar's "lg" is a
// fixed h-14 w-14 for exactly this reason — must stay in step with TILE_PX in
// layout-constants.ts.

export function championTitle(champion: TierChampion, stat?: TierChampionStat): string {
  if (!stat || stat.games === 0) return champion.name;
  const winRate = Math.round((stat.wins / stat.games) * 100);
  return `${champion.name} · ${stat.games} game${stat.games === 1 ? "" : "s"} · ${winRate}% WR`;
}

export function ChampionTile({
  champion,
  version,
  className,
}: {
  champion: TierChampion;
  version: string;
  className?: string;
}) {
  return <ChampionAvatar champion={champion} version={version} size="lg" className={className} />;
}

/**
 * A tile plus the games/win-rate chip that follows the cursor.
 *
 * The chip is fixed-positioned and portaled to the body rather than absolutely
 * positioned inside the tile, because the champion pool scrolls: an absolute
 * chip would be clipped by its own scroll container exactly when the pool is
 * long enough for anyone to care. `title` stays as the accessible fallback.
 */
export function ChampionTileWithStats({
  champion,
  version,
  stat,
}: {
  champion: TierChampion;
  version: string;
  stat?: TierChampionStat;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [chip, setChip] = useState<{ top: number; left: number } | null>(null);

  const winRate = stat && stat.games > 0 ? Math.round((stat.wins / stat.games) * 100) : null;

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setChip({ top: rect.top, left: rect.left + rect.width / 2 });
  }

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={() => setChip(null)}
      // Starting a drag should not leave a chip stranded over the board.
      onPointerDown={() => setChip(null)}
    >
      <ChampionTile champion={champion} version={version} />
      <span className="sr-only">{championTitle(champion, stat)}</span>
      {chip &&
        createPortal(
          <div
            style={{ top: chip.top, left: chip.left }}
            className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-center whitespace-nowrap shadow-lg"
          >
            <p className="text-xs font-medium text-white">{champion.name}</p>
            {winRate === null ? (
              <p className="text-[0.65rem] text-grey-mid">No tracked games</p>
            ) : (
              <p className="text-[0.65rem] tabular-nums text-grey-light">
                {stat!.games} game{stat!.games === 1 ? "" : "s"} · {winRate}% WR
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
