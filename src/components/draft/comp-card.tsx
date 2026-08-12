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

  return (
    <div className="panel-hex flex flex-col gap-2 p-3">
      <div className="flex items-start gap-2">
        {/* An unnamed synergy is titled by its champions instead. Dimmer type
            says the title was derived rather than typed, so an actual name
            still reads as the more deliberate thing. */}
        <h3
          className={cn(
            "font-heading flex-1 truncate text-sm font-semibold",
            comp.label ? "text-white" : "text-grey-mid",
          )}
        >
          {title}
        </h3>
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
      </div>

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

      {comp.win_conditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
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
          className="text-left text-xs text-grey-mid hover:text-grey-light"
        >
          <span className={cn(!notesOpen && "line-clamp-2")}>{comp.notes}</span>
        </button>
      )}
    </div>
  );
}
