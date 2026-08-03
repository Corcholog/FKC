"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  MAX_LABEL_CHARS,
  TIER_LABEL_TEXT,
  TIER_PALETTE,
  type Tier,
} from "@/lib/tierlist";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function TierSettingsDialog({
  tier,
  open,
  onOpenChange,
  onChange,
  onMove,
  onDelete,
  canMoveUp,
  canMoveDown,
  canDelete,
}: {
  tier: Tier | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<Tier>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit tier</DialogTitle>
          <DialogDescription>
            Renaming or recolouring is saved with the rest of the list.
          </DialogDescription>
        </DialogHeader>

        {tier && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tier-label">Label</Label>
              <Input
                id="tier-label"
                value={tier.label}
                maxLength={MAX_LABEL_CHARS}
                autoComplete="off"
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder="S"
              />
              <p className="text-xs text-grey-mid">
                Up to {MAX_LABEL_CHARS} characters. Leave it empty for an unnamed row.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2">
                {TIER_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Colour ${color}`}
                    aria-pressed={tier.color === color}
                    onClick={() => onChange({ color })}
                    style={{ backgroundColor: color, color: TIER_LABEL_TEXT }}
                    className={cn(
                      "size-8 rounded-sm border-2 text-xs font-bold",
                      tier.color === color ? "border-white" : "border-transparent",
                    )}
                  >
                    {tier.color === color ? "✓" : ""}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canMoveUp}
                onClick={() => onMove(-1)}
              >
                <ArrowUp />
                Move up
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canMoveDown}
                onClick={() => onMove(1)}
              >
                <ArrowDown />
                Move down
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="ml-auto"
                disabled={!canDelete}
                onClick={onDelete}
              >
                <Trash2 />
                Delete tier
              </Button>
            </div>
            {tier.championIds.length > 0 && (
              <p className="text-xs text-grey-mid">
                Deleting this tier returns its {tier.championIds.length} champion
                {tier.championIds.length === 1 ? "" : "s"} to the pool.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
