"use client";

import { useState } from "react";
import { CornerDownRight, Pencil } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import { formatRoleShort } from "@/lib/roles";
import { COMP_SIZE, compTitle, DRAFT_ROLES, type DraftCompRow } from "@/lib/draft/types";
import { extraChampions, type CompRelations } from "@/lib/draft/synergy-graph";
import { ChampionAvatar } from "@/components/champion-avatar";
import { DeleteCompButton } from "@/components/draft/delete-comp-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };

/**
 * One saved comp or synergy.
 *
 * The champions render in stored order and nothing sorts them: that order was
 * chosen in the save dialog, and for a five-champion comp it's team order, so
 * each position is labelled with its role. See the column comment in migration
 * 017.
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
  relations,
  onEdit,
  readOnly = false,
}: {
  comp: DraftCompRow;
  championById: Map<number, Champion>;
  version: string;
  /** slug → label, so a card never has to render a raw slug. */
  tagLabels: Map<string, string>;
  /**
   * The saved rows this one sits inside or contains, from `relateComps`.
   * Omitted where the caller hasn't computed them; there is nothing to draw
   * for a kind whose rows are all the same size.
   */
  relations?: CompRelations;
  onEdit: () => void;
  /** Drops Edit and Delete. See ChampionProfileTable's prop for why this is safe. */
  readOnly?: boolean;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const nameOf = (id: number) => championById.get(id)?.name ?? `#${id}`;
  const title = compTitle(comp, (id) => championById.get(id)?.name);

  // A five-champion comp is one champion per role, and the stored order is the
  // order someone dragged them into in the save dialog — so position is role
  // and the card can say so. A synergy is 2-4 champions with no such mapping,
  // and labelling those positions would be inventing information.
  const showsRoles = comp.champion_ids.length === COMP_SIZE;

  const champions = (
    <div className="flex flex-wrap gap-1">
      {comp.champion_ids.map((id, i) => {
        const champion = championById.get(id);
        return (
          <div key={`${id}-${i}`} className="flex flex-col items-center gap-0.5">
            {champion ? (
              <ChampionAvatar champion={champion} version={version} size="md" />
            ) : (
              // A champion Riot has since removed or renamed still has a row
              // here. Showing a placeholder beats dropping it silently and
              // making the comp look like it has four members.
              <span
                title={`Unknown champion (${id})`}
                className="flex h-10 w-10 items-center justify-center rounded-sm bg-bg-tertiary text-[10px] text-grey-mid"
              >
                ?
              </span>
            )}
            {showsRoles && (
              <span className="text-[10px] tracking-wide text-grey-mid uppercase">
                {formatRoleShort(DRAFT_ROLES[i] ?? null)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  const controls = readOnly ? null : (
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

      {/* Where this row sits among the others.
          `{Wukong, Orianna}` and `{Gnar, Wukong, Orianna}` are two cards with
          nothing linking them, and the second is the first plus a champion —
          which is the thing you want to know while looking at either one. The
          bigger row names only what it *adds*, since the champions it shares are
          the portraits directly above the line.

          The arrow is inline rather than a flex sibling, so a line that wraps
          reflows under it and gets the card's full width back. At two portraits
          the card is ~88px, where a 12px icon in its own column costs a fifth of
          every line after the first. */}
      {relations && (relations.containedBy.length > 0 || relations.contains.length > 0) && (
        <div className="flex w-0 min-w-full flex-col gap-0.5 text-[11px] text-grey-mid">
          {relations.containedBy.map((bigger) => (
            <p key={bigger.id}>
              <CornerDownRight aria-hidden className="mr-1 inline size-3 align-text-bottom" />
              also saved with{" "}
              <span className="text-grey-light">
                {extraChampions(comp, bigger).map(nameOf).join(" + ")}
              </span>
            </p>
          ))}
          {relations.contains.map((smaller) => (
            <p key={smaller.id}>
              <CornerDownRight aria-hidden className="mr-1 inline size-3 align-text-bottom" />
              extends{" "}
              <span className="text-grey-light">
                {smaller.champion_ids.map(nameOf).join(" + ")}
              </span>
            </p>
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
