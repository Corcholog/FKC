"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import { indexCounters } from "@/lib/draft/queries";
import type { ChampionCounterRow } from "@/lib/draft/types";
import { ChampionAvatar } from "@/components/champion-avatar";
import { CounterEditor } from "@/components/draft/counter-editor";
import { Button } from "@/components/ui/button";

type Champion = ChampionInfo & { championId: number };
type EditorTarget = { counterId?: number; targetId?: number };

function CounterList({
  rows,
  championById,
  version,
  otherSideOf,
  onEdit,
  emptyLabel,
}: {
  rows: ChampionCounterRow[];
  championById: Map<number, Champion>;
  version: string;
  otherSideOf: (row: ChampionCounterRow) => number;
  onEdit: (row: ChampionCounterRow) => void;
  emptyLabel: string;
}) {
  if (rows.length === 0) return <p className="text-xs text-grey-mid">{emptyLabel}</p>;
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((row) => {
        const other = championById.get(otherSideOf(row));
        if (!other) return null;
        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onEdit(row)}
              className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left hover:bg-bg-tertiary/40"
            >
              <ChampionAvatar champion={other} version={version} size="sm" />
              <span className="truncate text-sm text-grey-light">{other.name}</span>
              {row.note && <span className="truncate text-xs text-grey-mid">— {row.note}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The "counters / countered by" pair of lists for one champion, expanded
 * inline under its row in the champions table. Reads champion_counters
 * directly rather than through a shared table-level index — the dataset is
 * small and this only runs for whichever row is actually expanded.
 */
export function ChampionCounters({
  champion,
  champions,
  version,
  allCounters,
}: {
  champion: Champion;
  /** Full roster, for the editor's comboboxes. */
  champions: Champion[];
  version: string;
  allCounters: ChampionCounterRow[];
}) {
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);

  const index = useMemo(() => indexCounters(allCounters), [allCounters]);
  const championById = useMemo(() => new Map(champions.map((c) => [c.championId, c])), [champions]);

  const counters = index.counters.get(champion.championId) ?? [];
  const counteredBy = index.counteredBy.get(champion.championId) ?? [];

  function edit(row: ChampionCounterRow) {
    setEditorTarget({ counterId: row.counter_champion_id, targetId: row.target_champion_id });
  }

  return (
    <div className="grid gap-4 border-t border-border bg-bg-primary/40 p-3 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-medium tracking-wide text-grey-mid uppercase">
            {champion.name} counters
          </h3>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setEditorTarget({ counterId: champion.championId })}
          >
            <Plus className="size-3" />
            Add
          </Button>
        </div>
        <CounterList
          rows={counters}
          championById={championById}
          version={version}
          otherSideOf={(row) => row.target_champion_id}
          onEdit={edit}
          emptyLabel="Nothing noted."
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-medium tracking-wide text-grey-mid uppercase">Countered by</h3>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setEditorTarget({ targetId: champion.championId })}
          >
            <Plus className="size-3" />
            Add
          </Button>
        </div>
        <CounterList
          rows={counteredBy}
          championById={championById}
          version={version}
          otherSideOf={(row) => row.counter_champion_id}
          onEdit={edit}
          emptyLabel="Nothing noted."
        />
      </div>

      {editorTarget && (
        <CounterEditor
          key={`${editorTarget.counterId ?? "new"}-${editorTarget.targetId ?? "new"}`}
          champions={champions}
          version={version}
          counters={allCounters}
          defaultCounterId={editorTarget.counterId}
          defaultTargetId={editorTarget.targetId}
          onClose={() => setEditorTarget(null)}
        />
      )}
    </div>
  );
}
