"use client";

import { X } from "lucide-react";
import { EMPTY_CHAMPION_ICON_URL, type ChampionInfo } from "@/lib/ddragon";
import { slotLabel, type SlotRef } from "@/lib/draft/board";
import { ChampionAvatar } from "@/components/champion-avatar";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };

/**
 * One ban or pick slot.
 *
 * Two interactions, and the right-click one is the whole gotcha: without
 * `preventDefault()` the browser menu opens *and* the slot clears, which is
 * worse than either outcome on its own.
 *
 * Right-click isn't an accessible affordance, and clearing is the only
 * destructive action on the board, so every filled slot also carries a small ×
 * that appears on hover or keyboard focus. It's `data-export-hide` — chrome, not
 * board.
 */
export function DraftSlot({
  slot,
  champion,
  version,
  active,
  onActivate,
  onClear,
}: {
  slot: SlotRef;
  /** Resolved champion, or null for an empty slot. */
  champion: Champion | null;
  version: string;
  active: boolean;
  onActivate: () => void;
  onClear: () => void;
}) {
  const label = slotLabel(slot);
  const isBan = slot.kind === "ban";

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onActivate}
        onContextMenu={(e) => {
          // Without this the menu covers the board and the clear happens
          // underneath it anyway.
          e.preventDefault();
          if (champion) onClear();
        }}
        aria-label={
          champion ? `${label}: ${champion.name}. Click to select this slot.` : `${label}, empty`
        }
        aria-pressed={active}
        className={cn(
          "flex flex-col items-center gap-1 rounded-sm border p-1 transition-colors",
          active ? "border-gold bg-gold-muted/20" : "border-border hover:border-grey-mid",
          !champion && "border-dashed",
        )}
      >
        {champion ? (
          <ChampionAvatar
            champion={champion}
            version={version}
            size={isBan ? "md" : "lg"}
            banned={isBan}
          />
        ) : (
          // The grey silhouette rather than an empty box: it reads as a slot
          // waiting for a champion, and it's what makes the exported PNG look
          // like a draft rather than a form. See EMPTY_CHAMPION_ICON_URL — the
          // one asset in this app that isn't DDragon.
          // eslint-disable-next-line @next/next/no-img-element -- same reasoning as ChampionAvatar: tiny, and it needs crossOrigin for the PNG export
          <img
            src={EMPTY_CHAMPION_ICON_URL}
            alt=""
            crossOrigin="anonymous"
            draggable={false}
            className={cn(
              "shrink-0 rounded-sm bg-bg-tertiary object-cover opacity-40 select-none",
              isBan ? "h-10 w-10" : "h-14 w-14",
            )}
          />
        )}
        <span
          className={cn(
            "max-w-14 truncate text-[10px] leading-tight",
            champion ? "text-grey-light" : "text-grey-mid",
          )}
        >
          {champion?.name ?? label}
        </span>
      </button>

      {champion && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label}`}
          data-export-hide
          className="absolute -top-1 -right-1 rounded-full border border-border bg-bg-secondary p-0.5 text-grey-mid opacity-0 transition-opacity group-hover:opacity-100 hover:text-loss focus-visible:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
