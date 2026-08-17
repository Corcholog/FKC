"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, Plus, Search, Share2, X } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import {
  compTitle,
  DRAFT_COMP_SHAPE,
  type DraftCompKind,
  type DraftCompRow,
  type DraftTagRow,
} from "@/lib/draft/types";
import { relateComps } from "@/lib/draft/synergy-graph";
import { ChampionCombobox } from "@/components/champion-combobox";
import { CompCard } from "@/components/draft/comp-card";
import { CompFormDialog } from "@/components/draft/comp-form-dialog";
import { SynergyGraphView } from "@/components/draft/synergy-graph-view";
import { TagManagerDialog } from "@/components/draft/tag-manager-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };
const ALL_WINCONS = "__all__";

/** How the same filtered rows are drawn. See `DRAFT_COMP_SHAPE.graph`. */
type CompView = "cards" | "graph";

const COPY: Record<DraftCompKind, { title: string; noun: string; empty: string }> = {
  comp: {
    title: "Comps",
    noun: "comp",
    empty: "Nothing saved yet. Build a draft on the board and save a side from there, or add one by hand.",
  },
  synergy: {
    title: "Synergies",
    noun: "synergy",
    empty:
      "Nothing saved yet. Pick a few champions off a board and save them together, or add one by hand. Two champions and no name is a perfectly good synergy.",
  },
};

/**
 * The list page for one kind. Both /draft/comps and /draft/synergies are this
 * component with a different `kind` — the rows are the same shape and the only
 * thing that differs is how many champions each holds.
 *
 * Filtering is client-side over the full set. loadDraftComps can filter in
 * Postgres and a later phase uses that, but here the whole list is already
 * loaded to render it, and a round trip per keystroke would be slower than the
 * scan it replaces.
 */
export function CompList({
  kind,
  comps,
  champions,
  version,
  winConditionTags,
  readOnly = false,
}: {
  kind: DraftCompKind;
  comps: DraftCompRow[];
  champions: Champion[];
  version: string;
  winConditionTags: DraftTagRow[];
  /** Drops New, Edit, Delete and the tag manager. See ChampionProfileTable's prop. */
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [winCon, setWinCon] = useState(ALL_WINCONS);
  const [championFilter, setChampionFilter] = useState<Champion | null>(null);
  const [filterKey, setFilterKey] = useState(0);
  const [view, setView] = useState<CompView>("cards");
  // null = closed, { comp: null } = creating, { comp } = editing that row.
  const [editing, setEditing] = useState<{ comp: DraftCompRow | null } | null>(null);

  const championById = useMemo(() => new Map(champions.map((c) => [c.championId, c])), [champions]);
  const tagLabels = useMemo(
    () => new Map(winConditionTags.map((t) => [t.slug, t.label])),
    [winConditionTags],
  );

  /**
   * Over every row, not over `filtered` — deliberately. That a pair extends into
   * a trio is a fact about what's saved, not about what the search box is
   * currently showing, and recomputing it per filter would make the note blink
   * out of a card whose own contents hadn't changed.
   */
  const relations = useMemo(() => relateComps(comps), [comps]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return comps.filter((comp) => {
      // Matches compTitle, which falls back to the champions when there's no
      // name. Searching comp.label alone would silently return nothing for
      // every unnamed row, and neither kind requires a name.
      if (q && !compTitle(comp, (id) => championById.get(id)?.name).toLowerCase().includes(q)) {
        return false;
      }
      if (winCon !== ALL_WINCONS && !comp.win_conditions.includes(winCon)) return false;
      if (championFilter && !comp.champion_ids.includes(championFilter.championId)) return false;
      return true;
    });
  }, [comps, query, winCon, championFilter, championById]);

  const copy = COPY[kind];
  const shape = DRAFT_COMP_SHAPE[kind];
  const filtering = query.trim() !== "" || winCon !== ALL_WINCONS || championFilter !== null;

  function clearChampion() {
    setChampionFilter(null);
    setFilterKey((k) => k + 1); // the combobox keeps its own text; remount clears it
  }

  /**
   * Whether the controls are stacked in the graph's rail or laid out in a row
   * above the cards.
   *
   * Only true where there is a graph to put them beside, and only once there is
   * something to draw — the two empty states below are full-width panels with
   * no canvas, and a rail beside nothing is a column of filters pinned to the
   * left of a blank page.
   */
  const railed = shape.graph && view === "graph" && comps.length > 0 && filtered.length > 0;

  /**
   * One definition of the controls, laid out either way.
   *
   * In Cards they sit in a row above the wall; in Graph they are the top of the
   * rail beside the canvas, which is a column two-thirds narrower. Same
   * controls, same state, only the widths and the flow direction differ — which
   * is why this is one block parameterised by `railed` rather than two copies to
   * keep in step.
   */
  const controls = (
    <div className={railed ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2"}>
      {/* Grouped with the filters rather than with New and the tag manager: this
          changes how you're looking at the list, not what's in it. Both views
          draw the same `filtered` rows, so narrowing to one champion in Cards
          and switching to Graph gives you that champion's web. */}
      {shape.graph && (
        <div className={cn("flex items-center gap-1", !railed && "order-last ml-auto")}>
          {(["cards", "graph"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={view === option ? "default" : "outline"}
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className={railed ? "flex-1" : undefined}
            >
              {option === "cards" ? <LayoutGrid /> : <Share2 />}
              {option === "cards" ? "Cards" : "Graph"}
            </Button>
          ))}
        </div>
      )}

      <div className={cn("relative", railed && "w-full")}>
        <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-grey-mid" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className={cn("pl-8", railed ? "w-full" : "w-56")}
        />
      </div>

      {shape.winConditions && (
        <Select value={winCon} onValueChange={(v) => setWinCon(v as string)}>
          <SelectTrigger className={railed ? "w-full" : "w-44"}>
            <SelectValue>
              {(value: string) =>
                value === ALL_WINCONS
                  ? "Any win condition"
                  : (tagLabels.get(value) ?? "Any win condition")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_WINCONS}>Any win condition</SelectItem>
            {winConditionTags.map((tag) => (
              <SelectItem key={tag.slug} value={tag.slug}>
                {tag.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <ChampionCombobox
        key={filterKey}
        label="Contains champion"
        champions={champions}
        version={version}
        selected={championFilter}
        onSelect={setChampionFilter}
        className={railed ? "w-full" : "w-48"}
      />
      {championFilter && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={clearChampion}
          className={railed ? "w-full" : undefined}
        >
          <X className="size-3" />
          Clear
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">
          {copy.title}
          <span className="ml-2 tabular-nums text-grey-mid normal-case">
            {filtering ? `${filtered.length} of ${comps.length}` : comps.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {/* The win-condition vocabulary is only reachable from the kind that
              uses it — a manage button for tags this page can't set would be
              dead UI. */}
          {!readOnly && shape.winConditions && (
            <TagManagerDialog
              tags={winConditionTags}
              kind="win_condition"
              label="Manage win conditions"
            />
          )}
          {!readOnly && (
            <Button type="button" size="sm" onClick={() => setEditing({ comp: null })}>
              <Plus /> New {copy.noun}
            </Button>
          )}
        </div>
      </div>

      {/* Railed, the controls travel into the graph's own rail instead — see
          the `controls` slot on SynergyGraphView. */}
      {!railed && controls}

      {comps.length === 0 ? (
        <div className="panel-hex flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-grey-light">Nothing saved yet.</p>
          <p className="max-w-md text-xs text-grey-mid">{copy.empty}</p>
          {!readOnly && (
            <Button type="button" size="sm" className="mt-1" onClick={() => setEditing({ comp: null })}>
              <Plus /> New {copy.noun}
            </Button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <p className="panel-hex p-6 text-center text-sm text-grey-mid">
          Nothing matches those filters.
        </p>
      ) : railed ? (
        <SynergyGraphView
          comps={filtered}
          championById={championById}
          version={version}
          controls={controls}
        />
      ) : (
        // A wrapping row of content-sized cards, both kinds. Not a grid: every
        // column in a grid is as wide as the widest card, so a two-champion
        // synergy sat in a half-width panel that was mostly blank, and a comp
        // got a full column whether or not it had anything to put in one.
        <div className="flex flex-wrap gap-3">
          {filtered.map((comp) => (
            <CompCard
              key={comp.id}
              comp={comp}
              championById={championById}
              version={version}
              tagLabels={tagLabels}
              relations={relations.get(comp.id)}
              onEdit={() => setEditing({ comp })}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {/* Outside every branch above, so "New" works from the empty state too. */}
      {!readOnly && editing && (
        <CompFormDialog
          key={editing.comp?.id ?? "new"}
          kind={kind}
          champions={champions}
          version={version}
          winConditionTags={winConditionTags}
          comp={editing.comp}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
