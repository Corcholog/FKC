"use client";

import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripHorizontal } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import { formatRoleShort } from "@/lib/roles";
import { COMP_SIZE, DRAFT_ROLES } from "@/lib/draft/types";
import { ChampionAvatar } from "@/components/champion-avatar";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };

/**
 * The role a position implies, or null when the set isn't a full team.
 *
 * A five-champion comp has one champion per role, so position *is* role once
 * it's in team order — which is what makes reordering worth doing rather than
 * cosmetic. A synergy is two to four champions and has no such mapping; it just
 * reorders.
 */
function roleForIndex(index: number, total: number): string | null {
  return total === COMP_SIZE ? (DRAFT_ROLES[index] ?? null) : null;
}

function SortableChampion({
  champion,
  version,
  role,
  annotatedRoles,
}: {
  champion: Champion;
  version: string;
  role: string | null;
  /** This champion's roles from champion_profiles, for the fit hint. */
  annotatedRoles: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: champion.championId,
  });

  // Gold only when the team says this champion plays here. Grey covers both
  // "annotated, doesn't play here" and "never annotated" — the second is the
  // common case early on, and inventing a warning for it would cry wolf.
  const fits = role !== null && annotatedRoles.includes(role);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex touch-none flex-col items-center gap-0.5", isDragging && "opacity-30")}
    >
      {role && (
        <span
          className={cn(
            "text-[10px] font-medium tracking-wide uppercase",
            fits ? "text-gold-bright" : "text-grey-mid",
          )}
        >
          {formatRoleShort(role)}
        </span>
      )}
      <div
        {...attributes}
        {...listeners}
        title={`${champion.name} — drag to reorder`}
        className="cursor-grab rounded-sm active:cursor-grabbing"
      >
        <ChampionAvatar champion={champion} version={version} size="md" />
      </div>
      <GripHorizontal aria-hidden className="size-3 text-grey-mid" />
    </div>
  );
}

/**
 * The champions a save will write, in the order it will write them.
 *
 * Doubles as the dialog's preview — it covers the board while open, so without
 * this "did I save blue or red" is unanswerable until you visit /draft/comps —
 * and as the control for fixing that order. Champions arrive in draft order,
 * which is rarely how anyone reads a comp; dragging them into TOP→SUP is what
 * makes the saved row legible later.
 */
export function CompOrderEditor({
  championIds,
  championById,
  version,
  rolesByChampion,
  onReorder,
}: {
  championIds: number[];
  championById: Map<number, Champion>;
  version: string;
  /** championId → roles, from champion_profiles. Empty map is fine. */
  rolesByChampion: Map<number, string[]>;
  onReorder: (next: number[]) => void;
}) {
  const sensors = useSensors(
    // The same short threshold the tier list uses, so a drag that turns out to
    // be a click doesn't get swallowed.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = championIds.indexOf(Number(active.id));
    const to = championIds.indexOf(Number(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(championIds, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={championIds} strategy={horizontalListSortingStrategy}>
        <div className="flex flex-wrap items-end justify-center gap-2">
          {championIds.map((id, i) => {
            const champion = championById.get(id);
            if (!champion) return null;
            return (
              <SortableChampion
                key={id}
                champion={champion}
                version={version}
                role={roleForIndex(i, championIds.length)}
                annotatedRoles={rolesByChampion.get(id) ?? []}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
