"use client";

import { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Search } from "lucide-react";
import type { TierChampion, TierChampionStat } from "@/lib/tierlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { POOL_ID, PoolChampion } from "@/components/tierlist/dnd-items";
import { cn } from "@/lib/utils";

type PoolFilter = "all" | "played";

// Same ordering as the navbar's matchup search: prefix hits first so "sh"
// offers Shen before Ashe, and the internal codename is searchable too
// ("kaisa", "monkeyking").
function suggest(champions: TierChampion[], query: string): TierChampion[] {
  const q = query.trim().toLowerCase();
  if (!q) return champions;

  const prefix: TierChampion[] = [];
  const rest: TierChampion[] = [];
  for (const champion of champions) {
    const name = champion.name.toLowerCase();
    const id = champion.ddragonId.toLowerCase();
    if (name.startsWith(q) || id.startsWith(q)) prefix.push(champion);
    else if (name.includes(q) || id.includes(q)) rest.push(champion);
  }
  return [...prefix, ...rest];
}

export function ChampionPool({
  champions,
  version,
  stats,
  placed,
  onPick,
  targetLabel,
}: {
  /** The full roster, alphabetical. Placed champions are filtered out here. */
  champions: TierChampion[];
  version: string;
  stats: Map<number, TierChampionStat>;
  placed: Set<number>;
  onPick: (championId: number) => void;
  /** Label of the tier a click will drop into, shown in the hint. */
  targetLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PoolFilter>("all");
  const { setNodeRef, isOver } = useDroppable({ id: POOL_ID });

  const available = useMemo(() => {
    const unplaced = champions.filter((c) => !placed.has(c.championId));
    const scoped =
      filter === "played"
        ? unplaced.filter((c) => (stats.get(c.championId)?.games ?? 0) > 0)
        : unplaced;
    return suggest(scoped, query);
  }, [champions, placed, filter, stats, query]);

  return (
    <div className="panel-hex flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">
          Unranked
          <span className="ml-2 tabular-nums text-grey-mid normal-case">{available.length}</span>
        </h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter === "played" ? "default" : "outline"}
            onClick={() => setFilter("played")}
          >
            Played
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-grey-mid" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search champions"
          className="pl-8"
        />
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex max-h-72 flex-wrap content-start gap-1 overflow-y-auto rounded-sm border border-dashed p-2 transition-colors",
          isOver ? "border-gold bg-gold-muted/20" : "border-border",
        )}
      >
        {available.length === 0 ? (
          <p className="p-2 text-sm text-grey-mid">
            {query ? "No champion matches that." : "Everything is ranked."}
          </p>
        ) : (
          available.map((champion) => (
            <PoolChampion
              key={champion.championId}
              champion={champion}
              version={version}
              stat={stats.get(champion.championId)}
              onPick={() => onPick(champion.championId)}
            />
          ))
        )}
      </div>

      <p className="text-xs text-grey-mid">
        Drag a champion onto a tier, or click one to drop it into{" "}
        <span className="text-grey-light">{targetLabel}</span>. Drag back here to unrank.
      </p>
    </div>
  );
}
