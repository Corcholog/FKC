"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import { indexCounters } from "@/lib/draft/queries";
import type { ChampionCounterRow } from "@/lib/draft/types";
import { CounterGroupEditor } from "@/components/draft/counter-group-editor";
import { CounterList } from "@/components/draft/counter-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };
type Direction = "counters" | "counteredBy";

/**
 * The "counters / countered by" pair of lists for one champion. Mounted in two
 * places: inline under a row in the champions table, and as the focused view on
 * the counters page once a champion is searched for. Reads champion_counters
 * directly rather than through a shared table-level index — the dataset is
 * small and this only runs for the one champion being looked at.
 */
export function ChampionCounters({
  champion,
  champions,
  version,
  allCounters,
  className,
}: {
  champion: Champion;
  /** Full roster, for the editor's comboboxes. */
  champions: Champion[];
  version: string;
  allCounters: ChampionCounterRow[];
  /** Replaces the expanded-table-row framing — see the default below. */
  className?: string;
}) {
  const [editorDirection, setEditorDirection] = useState<Direction | null>(null);

  const index = useMemo(() => indexCounters(allCounters), [allCounters]);
  const championById = useMemo(() => new Map(champions.map((c) => [c.championId, c])), [champions]);

  const counters = index.counters.get(champion.championId) ?? [];
  const counteredBy = index.counteredBy.get(champion.championId) ?? [];

  return (
    <div
      className={cn(
        "grid gap-4 border-t border-border bg-bg-primary/40 p-3 sm:grid-cols-2",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-medium tracking-wide text-grey-mid uppercase">
            {champion.name} counters
          </h3>
          <Button type="button" size="xs" variant="outline" onClick={() => setEditorDirection("counters")}>
            <Plus className="size-3" />
            Add
          </Button>
        </div>
        <CounterList
          rows={counters}
          championById={championById}
          version={version}
          otherSideOf={(row) => row.target_champion_id}
          onOpen={() => setEditorDirection("counters")}
          emptyLabel="Nothing noted."
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-medium tracking-wide text-grey-mid uppercase">Countered by</h3>
          <Button type="button" size="xs" variant="outline" onClick={() => setEditorDirection("counteredBy")}>
            <Plus className="size-3" />
            Add
          </Button>
        </div>
        <CounterList
          rows={counteredBy}
          championById={championById}
          version={version}
          otherSideOf={(row) => row.counter_champion_id}
          onOpen={() => setEditorDirection("counteredBy")}
          emptyLabel="Nothing noted."
        />
      </div>

      {editorDirection && (
        <CounterGroupEditor
          key={editorDirection}
          champions={champions}
          version={version}
          counters={allCounters}
          direction={editorDirection}
          fixedChampionId={champion.championId}
          onClose={() => setEditorDirection(null)}
        />
      )}
    </div>
  );
}
