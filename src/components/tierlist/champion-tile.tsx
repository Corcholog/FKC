"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { championIconUrlById } from "@/lib/ddragon";
import type { TierChampion, TierChampionStat } from "@/lib/tierlist";
import { cn } from "@/lib/utils";

// Icons stay raw <img> rather than next/image, like the other small champion
// icons in the app (player-card, matchup-search) — but here there's a second
// reason: html-to-image walks the real DOM to build the PNG, and crossOrigin
// has to be set on the element itself for DDragon's images to inline instead of
// tainting the canvas.

// One fixed size everywhere, not a responsive class. The PNG is captured from
// an off-screen node, and `sm:` variants there resolve against the *viewport*,
// so a responsive tile would export at a different size from a phone than from
// a desktop. Must stay in step with TILE_PX in layout-constants.
const TILE_CLASS = "h-14 w-14";

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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={championIconUrlById(champion.ddragonId, version)}
      alt={champion.name}
      crossOrigin="anonymous"
      draggable={false}
      className={cn("rounded-sm bg-bg-tertiary object-cover select-none", TILE_CLASS, className)}
    />
  );
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
