"use client";

import type { ChampionInfo } from "@/lib/ddragon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Asked when placing a champion in one game would leave it also sitting in a
 * later one.
 *
 * The fearless rule only looks backwards — a champion is blocked by *earlier*
 * games — so editing G1 after G3 is drafted can produce a series where the same
 * champion is picked twice, with neither game's grid flagging it. Rather than
 * forbid the edit (which would mean clearing every later game by hand first),
 * the board makes the consequence explicit and lets it be confirmed.
 */
export function PickConflictDialog({
  champion,
  /** 1-based game numbers that already hold this champion. */
  games,
  onConfirm,
  onCancel,
}: {
  champion: ChampionInfo;
  games: number[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const list = games.map((n) => `game ${n}`).join(" and ");

  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{champion.name} is already picked in {list}.</DialogTitle>
          <DialogDescription>
            Fearless means a champion is only played once in the series, so it can&apos;t sit
            here and there at the same time. Placing {champion.name} here removes{" "}
            {games.length === 1 ? "it" : "them"} from {list} — the rest of{" "}
            {games.length === 1 ? "that draft stays" : "those drafts stay"} as{" "}
            {games.length === 1 ? "it is" : "they are"}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="button" onClick={onConfirm}>
            Place it here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
