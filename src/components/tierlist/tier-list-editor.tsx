"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Loader2, Plus, RotateCcw, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  MAX_TIERS,
  TIER_LABEL_TEXT,
  TIER_PALETTE,
  newTierId,
  placedChampionIds,
  type Tier,
  type TierChampion,
  type TierChampionStat,
} from "@/lib/tierlist";
import { saveTierList } from "@/app/(app)/prep/tierlists/actions";
import { Button } from "@/components/ui/button";
import { ChampionTile } from "@/components/tierlist/champion-tile";
import { ChampionPool } from "@/components/tierlist/champion-pool";
import { ROW_MIN_HEIGHT_CLASS } from "@/components/tierlist/layout-constants";
import { DeleteTierListButton } from "@/components/tierlist/delete-tier-list-button";
import { DownloadPngButton } from "@/components/tierlist/download-png-button";
import { TierListExportNode } from "@/components/tierlist/tier-list-export-node";
import { TierSettingsDialog } from "@/components/tierlist/tier-settings-dialog";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import {
  POOL_ID,
  SortableChampion,
  championDragId,
  championIdFromDragId,
  isChampionDragId,
  tierDropId,
  tierIdFromDropId,
} from "@/components/tierlist/dnd-items";
import { cn } from "@/lib/utils";

const EXPORT_NODE_ID = "tierlist-export";

// A container is either a tier's id or the pool. Both live in the same id space
// as the champions being dragged, hence the prefixes in dnd-items.
type ContainerId = string;

function tierOfChampion(tiers: Tier[], championId: number): ContainerId {
  return tiers.find((t) => t.championIds.includes(championId))?.id ?? POOL_ID;
}

/** Which container a drop target belongs to — the row itself, or the row holding it. */
function containerOfDropTarget(tiers: Tier[], overId: string): ContainerId | null {
  if (overId === POOL_ID) return POOL_ID;
  if (overId.startsWith("tier:")) return tierIdFromDropId(overId);
  if (isChampionDragId(overId)) return tierOfChampion(tiers, championIdFromDragId(overId));
  return null;
}

/**
 * Whatever is under the cursor wins.
 *
 * Not closestCenter, which is the usual sortable default: it ranks drop targets
 * by how near the dragged rect is to each target's *centre*, and a tier row is
 * as wide as the board. Every row's centre sits far to the right of a champion
 * being dragged near the left, so that horizontal gap dominates the distance
 * and dragging straight up or down barely changes which row wins — you'd have
 * to haul the icon out to the middle of the board first.
 *
 * pointerWithin has no such bias: a row is a candidate exactly when the cursor
 * is inside it. rectIntersection covers the keyboard sensor, which has no
 * pointer coordinates at all.
 */
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

function withoutChampion(tiers: Tier[], championId: number): Tier[] {
  return tiers.map((tier) =>
    tier.championIds.includes(championId)
      ? { ...tier, championIds: tier.championIds.filter((id) => id !== championId) }
      : tier,
  );
}

function withChampionAt(tiers: Tier[], tierId: string, championId: number, index: number): Tier[] {
  return tiers.map((tier) => {
    if (tier.id !== tierId) return tier;
    const championIds = [...tier.championIds];
    championIds.splice(Math.max(0, Math.min(index, championIds.length)), 0, championId);
    return { ...tier, championIds };
  });
}

export function TierListEditor({
  playerId,
  playerName,
  playerSlug,
  initialTiers,
  hasSavedList,
  champions,
  version,
  stats,
}: {
  playerId: string;
  playerName: string;
  playerSlug: string;
  initialTiers: Tier[];
  /** False when this is a brand-new list seeded from the defaults. */
  hasSavedList: boolean;
  champions: TierChampion[];
  version: string;
  stats: Map<number, TierChampionStat>;
}) {
  const router = useRouter();
  const [tiers, setTiers] = useState<Tier[]>(initialTiers);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [settingsTierId, setSettingsTierId] = useState<string | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string>(initialTiers[0]?.id ?? "");
  const [saving, startSaving] = useTransition();

  // The saved document as a string, so "is this dirty?" is one comparison and
  // an edit that ends up back where it started stops counting as a change.
  const [savedJson, setSavedJson] = useState(() =>
    hasSavedList ? JSON.stringify(initialTiers) : "",
  );
  const dirty = JSON.stringify(tiers) !== savedJson;

  // Restored when a drag is cancelled or dropped into nowhere — onDragOver has
  // already been rearranging things live by then.
  const snapshot = useRef<Tier[]>(initialTiers);

  const championsById = useMemo(
    () => new Map(champions.map((c) => [c.championId, c])),
    [champions],
  );
  const placed = useMemo(() => placedChampionIds(tiers), [tiers]);
  const settingsTier = tiers.find((t) => t.id === settingsTierId) ?? null;
  const settingsIndex = tiers.findIndex((t) => t.id === settingsTierId);
  const selectedTier = tiers.find((t) => t.id === selectedTierId) ?? tiers[0] ?? null;

  const sensors = useSensors(
    // A short drag threshold so clicking a pool champion still registers as a
    // click — that's the tap-to-place path.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ----------------------------------------------------------------
  // Drag and drop
  //
  // The pool has no state of its own — it's every champion that isn't in a
  // tier. So a drag only ever edits `tiers`: leaving the pool is an insert,
  // returning to it is a delete.
  // ----------------------------------------------------------------

  function handleDragStart(event: DragStartEvent) {
    snapshot.current = tiers;
    setActiveDragId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || !isChampionDragId(activeId)) return;

    const championId = championIdFromDragId(activeId);

    setTiers((prev) => {
      const from = tierOfChampion(prev, championId);
      const to = containerOfDropTarget(prev, overId);
      if (!to || to === from) return prev;

      if (to === POOL_ID) return withoutChampion(prev, championId);

      const target = prev.find((t) => t.id === to);
      if (!target) return prev;

      // Dropped onto another champion: take its slot. Dropped onto the row
      // itself: go on the end.
      let index = target.championIds.length;
      if (isChampionDragId(overId)) {
        const overIndex = target.championIds.indexOf(championIdFromDragId(overId));
        if (overIndex >= 0) index = overIndex;
      }
      return withChampionAt(withoutChampion(prev, championId), to, championId, index);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);

    const activeId = String(event.active.id);
    if (!isChampionDragId(activeId)) return;

    // Let go over nothing — undo everything the hover already did.
    if (!event.over) {
      setTiers(snapshot.current);
      return;
    }

    const overId = String(event.over.id);
    const championId = championIdFromDragId(activeId);

    // Cross-container moves were settled during the drag; all that's left is
    // reordering within one row.
    setTiers((prev) => {
      const from = tierOfChampion(prev, championId);
      if (from === POOL_ID || containerOfDropTarget(prev, overId) !== from) return prev;

      const tierIndex = prev.findIndex((t) => t.id === from);
      const list = prev[tierIndex].championIds;
      const oldIndex = list.indexOf(championId);
      let newIndex = list.length - 1;
      if (isChampionDragId(overId)) {
        const overIndex = list.indexOf(championIdFromDragId(overId));
        if (overIndex >= 0) newIndex = overIndex;
      }
      if (oldIndex === newIndex || oldIndex < 0) return prev;

      const next = [...prev];
      next[tierIndex] = { ...next[tierIndex], championIds: arrayMove(list, oldIndex, newIndex) };
      return next;
    });
  }

  function handleDragCancel() {
    setActiveDragId(null);
    setTiers(snapshot.current);
  }

  // ----------------------------------------------------------------
  // Tier editing
  // ----------------------------------------------------------------

  function placeInSelectedTier(championId: number) {
    if (!selectedTier) {
      toast.error("Add a tier first.");
      return;
    }
    setTiers((prev) =>
      withChampionAt(withoutChampion(prev, championId), selectedTier.id, championId, Infinity),
    );
  }

  function addTier() {
    if (tiers.length >= MAX_TIERS) return;
    const tier: Tier = {
      id: newTierId(),
      label: "",
      color: TIER_PALETTE[Math.min(tiers.length, TIER_PALETTE.length - 1)],
      championIds: [],
    };
    setTiers((prev) => [...prev, tier]);
    setSelectedTierId(tier.id);
  }

  function patchTier(tierId: string, patch: Partial<Tier>) {
    setTiers((prev) => prev.map((tier) => (tier.id === tierId ? { ...tier, ...patch } : tier)));
  }

  function moveTier(tierId: string, direction: -1 | 1) {
    setTiers((prev) => {
      const index = prev.findIndex((t) => t.id === tierId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      return arrayMove(prev, index, target);
    });
  }

  function deleteTier(tierId: string) {
    // The tier's champions aren't deleted with it — dropping the row just puts
    // them back in the pool, which is where unranked champions live.
    setTiers((prev) => prev.filter((t) => t.id !== tierId));
    setSettingsTierId(null);
    if (selectedTierId === tierId) setSelectedTierId(tiers.find((t) => t.id !== tierId)?.id ?? "");
  }

  function reset() {
    const saved = savedJson ? (JSON.parse(savedJson) as Tier[]) : initialTiers;
    setTiers(saved);
  }

  function save() {
    const snapshotJson = JSON.stringify(tiers);
    startSaving(async () => {
      const result = await saveTierList(playerId, tiers);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSavedJson(snapshotJson);
      toast.success("Tier list saved.");
      router.refresh();
    });
  }

  const activeChampion =
    activeDragId && isChampionDragId(activeDragId)
      ? championsById.get(championIdFromDragId(activeDragId))
      : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={reset} disabled={!dirty}>
            <RotateCcw />
            Reset
          </Button>
          <DownloadPngButton
            targetId={EXPORT_NODE_ID}
            fileName={`${playerSlug}-tierlist.png`}
            label="Download PNG"
          />
          {hasSavedList && (
            <DeleteTierListButton
              playerId={playerId}
              playerName={playerName}
              redirectTo="/prep/tierlists"
            />
          )}
          {/* A tier list is twenty-odd deliberate placements and nothing about
              it autosaves, so while it's dirty this reads as a warning rather
              than as status text — same reason the guard below exists. */}
          <span className="ml-auto text-xs text-grey-mid">
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-bg px-2 py-0.5 font-medium text-warning">
                <span className="size-1.5 rounded-full bg-warning" />
                Unsaved changes
              </span>
            ) : hasSavedList || savedJson ? (
              "All changes saved"
            ) : (
              "Not saved yet"
            )}
          </span>
        </div>

        <div className="panel-hex overflow-hidden">
          {tiers.map((tier, index) => (
            <EditableTierRow
              key={tier.id}
              tier={tier}
              championsById={championsById}
              version={version}
              stats={stats}
              selected={tier.id === selectedTierId}
              onSelect={() => setSelectedTierId(tier.id)}
              onOpenSettings={() => setSettingsTierId(tier.id)}
              onRemoveChampion={(championId) =>
                setTiers((prev) => withoutChampion(prev, championId))
              }
              isLast={index === tiers.length - 1}
            />
          ))}
          <div className="flex items-center justify-between gap-2 bg-bg-secondary p-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addTier}
              disabled={tiers.length >= MAX_TIERS}
            >
              <Plus />
              Add tier
            </Button>
            <span className="text-xs text-grey-mid">
              {tiers.length}/{MAX_TIERS} tiers · {placed.size} ranked
            </span>
          </div>
        </div>

        <ChampionPool
          champions={champions}
          version={version}
          stats={stats}
          placed={placed}
          onPick={placeInSelectedTier}
          targetLabel={selectedTier ? selectedTier.label || "the selected tier" : "no tier"}
        />
      </div>

      <TierListExportNode
        id={EXPORT_NODE_ID}
        title={`${playerName} — champion tier list`}
        subtitle={`Patch ${version}`}
        tiers={tiers}
        champions={championsById}
        version={version}
      />

      {/* Nothing here autosaves, and a tier list is an hour of somebody's
          opinions. Clicking any link in the navbar used to drop the lot without
          a word — a client-side navigation never fires beforeunload. */}
      <UnsavedChangesGuard
        when={dirty}
        title="Leave without saving this tier list?"
        description="The tiers you've moved since the last save aren't stored anywhere yet, and leaving loses them."
      />

      <TierSettingsDialog
        tier={settingsTier}
        open={settingsTier !== null}
        onOpenChange={(open) => !open && setSettingsTierId(null)}
        onChange={(patch) => settingsTier && patchTier(settingsTier.id, patch)}
        onMove={(direction) => settingsTier && moveTier(settingsTier.id, direction)}
        onDelete={() => settingsTier && deleteTier(settingsTier.id)}
        canMoveUp={settingsIndex > 0}
        canMoveDown={settingsIndex >= 0 && settingsIndex < tiers.length - 1}
        canDelete={tiers.length > 1}
      />

      {/* Not portaled to the body: the overlay positions itself fixed, and
          nothing between here and <main> transforms or clips, so a portal would
          only buy a hydration guard we don't need. */}
      <DragOverlay dropAnimation={null}>
        {activeChampion ? (
          <ChampionTile
            champion={activeChampion}
            version={version}
            className="ring-2 ring-gold-bright"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function EditableTierRow({
  tier,
  championsById,
  version,
  stats,
  selected,
  onSelect,
  onOpenSettings,
  onRemoveChampion,
  isLast,
}: {
  tier: Tier;
  championsById: Map<number, TierChampion>;
  version: string;
  stats: Map<number, TierChampionStat>;
  selected: boolean;
  onSelect: () => void;
  onOpenSettings: () => void;
  onRemoveChampion: (championId: number) => void;
  isLast: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tierDropId(tier.id) });
  const dragIds = tier.championIds.map(championDragId);

  return (
    // The drop target is the whole row, label and gear column included, not
    // just the strip the icons sit in — anywhere along the row is a fair place
    // to aim for.
    <div
      ref={setNodeRef}
      className={cn("flex items-stretch border-b border-border", isLast && "border-b-0")}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{ backgroundColor: tier.color, color: TIER_LABEL_TEXT }}
        title="Make this the tier that clicked champions go into"
        className={cn(
          "relative flex w-14 shrink-0 items-center justify-center overflow-hidden p-1 text-center font-heading text-base leading-tight font-bold break-words uppercase sm:w-24 sm:text-lg",
          selected && "ring-2 ring-white ring-inset",
        )}
      >
        {tier.label || <span className="opacity-40">—</span>}
      </button>

      <SortableContext items={dragIds} strategy={rectSortingStrategy}>
        <div
          className={cn(
            "flex flex-1 flex-wrap content-start gap-1 p-1.5 transition-colors",
            ROW_MIN_HEIGHT_CLASS,
            isOver ? "bg-bg-tertiary" : "bg-bg-secondary",
          )}
        >
          {tier.championIds.map((championId) => {
            const champion = championsById.get(championId);
            if (!champion) return null;
            return (
              <SortableChampion
                key={championId}
                champion={champion}
                version={version}
                stat={stats.get(championId)}
                onRemove={() => onRemoveChampion(championId)}
              />
            );
          })}
        </div>
      </SortableContext>

      <div
        className={cn(
          "flex shrink-0 items-start p-1.5 transition-colors",
          isOver ? "bg-bg-tertiary" : "bg-bg-secondary",
        )}
      >
        <Button type="button" size="icon-sm" variant="ghost" onClick={onOpenSettings}>
          <Settings2 />
          <span className="sr-only">Edit tier {tier.label}</span>
        </Button>
      </div>
    </div>
  );
}
