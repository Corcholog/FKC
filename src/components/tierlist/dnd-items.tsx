"use client";

import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import type { TierChampion, TierChampionStat } from "@/lib/tierlist";
import { ChampionTileWithStats } from "@/components/tierlist/champion-tile";
import { cn } from "@/lib/utils";

// Every draggable and droppable in the board shares one id namespace, so the
// prefixes are what tell a champion apart from the row it's sitting in.
export const POOL_ID = "pool";

export function championDragId(championId: number): string {
  return `champ:${championId}`;
}

export function tierDropId(tierId: string): string {
  return `tier:${tierId}`;
}

export function isChampionDragId(id: string): boolean {
  return id.startsWith("champ:");
}

export function championIdFromDragId(id: string): number {
  return Number(id.slice("champ:".length));
}

export function tierIdFromDropId(id: string): string {
  return id.slice("tier:".length);
}

/** A champion sitting in a tier: sortable within its row, draggable between rows. */
export function SortableChampion({
  champion,
  version,
  stat,
  onRemove,
}: {
  champion: TierChampion;
  version: string;
  stat?: TierChampionStat;
  onRemove: () => void;
}) {
  const id = championDragId(champion.championId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group relative touch-none", isDragging && "opacity-30")}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <ChampionTileWithStats champion={champion} version={version} stat={stat} />
      </div>
      {/* Unranking without dragging — the only way to do it one-handed on a
          phone, which is why it's always visible on coarse pointers. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${champion.name}`}
        className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border border-border bg-bg-primary text-grey-light opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 hover:text-danger"
      >
        <X className="size-2.5" />
      </button>
    </div>
  );
}

/** A champion in the unranked pool. Order there is derived, so it never sorts. */
export function PoolChampion({
  champion,
  version,
  stat,
  onPick,
}: {
  champion: TierChampion;
  version: string;
  stat?: TierChampionStat;
  onPick: () => void;
}) {
  const id = championDragId(champion.championId);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <button
      ref={setNodeRef}
      type="button"
      // A tap is not a drag: the pointer sensor's distance constraint lets the
      // click through, which is how you place a champion on a touchscreen.
      onClick={onPick}
      {...attributes}
      {...listeners}
      className={cn(
        "touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-gold",
        isDragging ? "opacity-30" : "cursor-grab active:cursor-grabbing",
      )}
    >
      <ChampionTileWithStats champion={champion} version={version} stat={stat} />
    </button>
  );
}
