"use client";

import { championIconUrlById, type ChampionInfo } from "@/lib/ddragon";
import { cn } from "@/lib/utils";

// The client counterpart to components/champion-icon.tsx. That one is a Server
// Component so a couple hundred of them don't ship the champion map to the
// browser; this one exists for the client trees that need a champion image —
// the tier list board and, from here on, the draft simulator — and it takes a
// resolved ChampionInfo rather than a numeric id, since a client component
// can't be handed the map to resolve one from.
//
// crossOrigin="anonymous" is load-bearing, not decorative: html-to-image walks
// the real DOM to build a PNG, and without it on the <img> itself DDragon's
// images taint the canvas instead of inlining, and the export comes out as
// blank squares where champions should be. See download-png-button.tsx.

const SIZES = {
  sm: "h-6 w-6",
  md: "h-10 w-10",
  lg: "h-14 w-14", // must stay in step with TILE_PX in tierlist/layout-constants.ts
  xl: "h-20 w-20",
} as const;

export function ChampionAvatar({
  champion,
  version,
  size = "md",
  dimmed = false,
  banned = false,
  selected = false,
  className,
}: {
  champion: ChampionInfo;
  version: string;
  size?: keyof typeof SIZES;
  /** Greys it out — unavailable on the board right now. */
  dimmed?: boolean;
  /** Greys it out *and* strikes it through, same treatment as ChampionIcon. */
  banned?: boolean;
  /** Gold ring — the synergy selection mode uses this. */
  selected?: boolean;
  className?: string;
}) {
  return (
    <span
      title={banned ? `${champion.name} — banned` : champion.name}
      // overflow-hidden clips the slash to the icon box, so the rotated line
      // reads as a strike across the portrait rather than a stray diagonal.
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-sm",
        selected && "ring-2 ring-gold ring-offset-1 ring-offset-bg-secondary",
        SIZES[size],
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny champion portrait; also needs crossOrigin for the PNG export, which next/image can't set */}
      <img
        src={championIconUrlById(champion.ddragonId, version)}
        alt={champion.name}
        crossOrigin="anonymous"
        draggable={false}
        loading="lazy"
        className={cn(
          "h-full w-full rounded-sm bg-bg-tertiary object-cover select-none",
          banned ? "opacity-55 grayscale" : dimmed ? "opacity-40 grayscale" : "",
        )}
      />
      {banned && (
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-px w-[160%] -rotate-45 bg-loss/80" />
        </span>
      )}
    </span>
  );
}
