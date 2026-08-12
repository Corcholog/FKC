"use client";

import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import {
  compTitle,
  DRAFT_COMP_SHAPE,
  type DraftCompKind,
  type DraftCompRow,
  type DraftTagRow,
} from "@/lib/draft/types";
import { ChampionCombobox } from "@/components/champion-combobox";
import { CompCard } from "@/components/draft/comp-card";
import { CompFormDialog } from "@/components/draft/comp-form-dialog";
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

type Champion = ChampionInfo & { championId: number };
const ALL_WINCONS = "__all__";

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
}: {
  kind: DraftCompKind;
  comps: DraftCompRow[];
  champions: Champion[];
  version: string;
  winConditionTags: DraftTagRow[];
}) {
  const [query, setQuery] = useState("");
  const [winCon, setWinCon] = useState(ALL_WINCONS);
  const [championFilter, setChampionFilter] = useState<Champion | null>(null);
  const [filterKey, setFilterKey] = useState(0);
  // null = closed, { comp: null } = creating, { comp } = editing that row.
  const [editing, setEditing] = useState<{ comp: DraftCompRow | null } | null>(null);

  const championById = useMemo(() => new Map(champions.map((c) => [c.championId, c])), [champions]);
  const tagLabels = useMemo(
    () => new Map(winConditionTags.map((t) => [t.slug, t.label])),
    [winConditionTags],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return comps.filter((comp) => {
      // Matches the *displayed* title, which for an unnamed synergy is its
      // champions. Searching comp.label alone would silently return nothing for
      // most synergies, since most of them won't have one.
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
          {shape.winConditions && (
            <TagManagerDialog
              tags={winConditionTags}
              kind="win_condition"
              label="Manage win conditions"
            />
          )}
          <Button type="button" size="sm" onClick={() => setEditing({ comp: null })}>
            <Plus /> New {copy.noun}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-grey-mid" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={shape.requiresLabel ? "Search by name" : "Search"}
            className="w-56 pl-8"
          />
        </div>

        {shape.winConditions && (
          <Select value={winCon} onValueChange={(v) => setWinCon(v as string)}>
            <SelectTrigger className="w-44">
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
          className="w-48"
        />
        {championFilter && (
          <Button type="button" size="sm" variant="outline" onClick={clearChampion}>
            <X className="size-3" />
            Clear
          </Button>
        )}
      </div>

      {comps.length === 0 ? (
        <div className="panel-hex flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-grey-light">Nothing saved yet.</p>
          <p className="max-w-md text-xs text-grey-mid">{copy.empty}</p>
          <Button type="button" size="sm" className="mt-1" onClick={() => setEditing({ comp: null })}>
            <Plus /> New {copy.noun}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="panel-hex p-6 text-center text-sm text-grey-mid">
          Nothing matches those filters.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((comp) => (
            <CompCard
              key={comp.id}
              comp={comp}
              championById={championById}
              version={version}
              tagLabels={tagLabels}
              onEdit={() => setEditing({ comp })}
            />
          ))}
        </div>
      )}

      {/* Outside every branch above, so "New" works from the empty state too. */}
      {editing && (
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
