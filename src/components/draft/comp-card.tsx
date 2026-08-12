"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import { compTitle, type DraftCompRow } from "@/lib/draft/types";
import { ChampionAvatar } from "@/components/champion-avatar";
import { DeleteCompButton } from "@/components/draft/delete-comp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };

/**
 * One saved comp or synergy.
 *
 * The champions render in stored order and nothing sorts them: for a comp that
 * order is the pick order off one side of a board, which is real information
 * about how the draft was meant to go. See the column comment in migration 017.
 *
 * **The name leads when there is one; otherwise the champions do and carry the
 * controls.** Neither kind requires a name, and a heading spelling out the
 * portraits directly beneath it ("Ornn + Yasuo", above Ornn and Yasuo) is two
 * rows saying one thing. So compTitle's fallback is deliberately *not* used
 * here, only on the surfaces that can't show portraits — the delete
 * confirmation, aria-labels, the search filter.
 *
 * **The card is sized by its champions, not by its tags or its notes.** It's
 * `w-fit`, so its width comes from the widest row — which should be the
 * portraits plus the controls, the one row that genuinely can't wrap any
 * narrower. Win conditions and notes are excluded from that calculation with
 * `w-0 min-w-full`: width 0 contributes nothing to the parent's shrink-to-fit,
 * and min-width 100% then fills whatever width the champions settled on. Without
 * it a comp carrying six win conditions stretched into one long line of badges
 * and dragged the whole card out with it; now they wrap.
 */
export function CompCard({
  comp,
  championById,
  version,
  tagLabels,
  onEdit,
}: {
  comp: DraftCompRow;
  championById: Map<number, Champion>;
  version: string;
  /** slug → label, so a card never has to render a raw slug. */
  tagLabels: Map<string, string>;
  onEdit: () => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const title = compTitle(comp, (id) => championById.get(id)?.name);

  const champions = (
    <div className="flex flex-wrap gap-1">
      {comp.champion_ids.map((id, i) => {
        const champion = championById.get(id);
        // A champion Riot has since removed or renamed still has a row here.
        // Showing the bare id beats dropping it silently and making the comp
        // look like it has four members.
        return champion ? (
          <ChampionAvatar key={`${id}-${i}`} champion={champion} version={version} size="md" />
        ) : (
          <span
            key={`${id}-${i}`}
            title={`Unknown champion (${id})`}
            className="flex h-10 w-10 items-center justify-center rounded-sm bg-bg-tertiary text-[10px] text-grey-mid"
          >
            ?
          </span>
        );
      })}
    </div>
  );

  const controls = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onEdit}
        aria-label={`Edit ${title}`}
        className="text-grey-mid hover:text-grey-light"
      >
        <Pencil className="size-3" />
      </Button>
      <DeleteCompButton compId={comp.id} kind={comp.kind} title={title} />
    </>
  );

  return (
    // max-w-sm is the ceiling for the one thing that *should* be allowed to
    // widen the card past its portraits: a long name.
    <div className="panel-hex flex w-fit max-w-sm flex-col gap-2 p-3">
      {comp.label ? (
        <>
          <div className="flex items-start gap-2">
            <h3 className="font-heading flex-1 truncate text-sm font-semibold text-white">
              {comp.label}
            </h3>
            {controls}
          </div>
          {champions}
        </>
      ) : (
        <div className="flex items-center gap-2">
          {champions}
          <div className="flex shrink-0 items-center">{controls}</div>
        </div>
      )}

      {/* w-0 min-w-full: see the note on this component. These two wrap inside
          the card's width instead of setting it. */}
      {comp.win_conditions.length > 0 && (
        <div className="flex w-0 min-w-full flex-wrap gap-1">
          {comp.win_conditions.map((slug) => (
            <Badge key={slug} variant="outline">
              {tagLabels.get(slug) ?? slug}
            </Badge>
          ))}
        </div>
      )}

      {comp.notes && (
        <button
          type="button"
          onClick={() => setNotesOpen((o) => !o)}
          aria-expanded={notesOpen}
          className="w-0 min-w-full text-left text-xs text-grey-mid hover:text-grey-light"
        >
          <span className={cn(!notesOpen && "line-clamp-2")}>{comp.notes}</span>
        </button>
      )}
    </div>
  );
}
