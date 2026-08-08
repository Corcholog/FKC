"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import {
  lolalyticsMatchupUrl,
  LOLALYTICS_LANES,
  DEFAULT_LANE,
  type LolalyticsLane,
} from "@/lib/lolalytics";
import { Button } from "@/components/ui/button";
import { ChampionCombobox } from "@/components/champion-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Lane picker plus two champion fields, opening the Lolalytics matchup page
 * (Master+) in a new tab as soon as both sides are picked. Champion list comes
 * from DDragon, so it tracks the live patch.
 */
export function MatchupSearch({
  champions,
  version,
  defaultLane = DEFAULT_LANE,
  stacked = false,
  className,
  onOpened,
}: {
  champions: ChampionInfo[];
  version: string;
  /** Prefilled lane — the signed-in player's most-played role. */
  defaultLane?: LolalyticsLane;
  /** Full-width labelled layout for the mobile menu, instead of the navbar row. */
  stacked?: boolean;
  className?: string;
  onOpened?: () => void;
}) {
  const [lane, setLane] = useState<LolalyticsLane>(defaultLane);
  const [champion, setChampion] = useState<ChampionInfo | null>(null);
  const [opponent, setOpponent] = useState<ChampionInfo | null>(null);

  function openMatchup(a: ChampionInfo, b: ChampionInfo) {
    window.open(
      lolalyticsMatchupUrl(a.ddragonId, b.ddragonId, lane),
      "_blank",
      "noopener,noreferrer",
    );
    onOpened?.();
  }

  // Picking the side that completes the pair fires straight off — that's the
  // whole request, no confirm click. The arrow re-opens the same matchup.
  function handleSelect(side: "champion" | "opponent", picked: ChampionInfo | null) {
    const next = side === "champion" ? picked : champion;
    const nextOpponent = side === "opponent" ? picked : opponent;
    setChampion(next);
    setOpponent(nextOpponent);
    if (picked && next && nextOpponent) openMatchup(next, nextOpponent);
  }

  function submit() {
    if (champion && opponent) openMatchup(champion, opponent);
  }

  const fieldClass = stacked ? "w-full" : "w-28";

  return (
    <div
      className={cn(stacked ? "flex flex-col gap-1.5" : "flex items-center gap-1.5", className)}
    >
      {stacked && (
        <span className="text-xs font-medium tracking-wide text-grey-light uppercase">
          Matchup lookup
        </span>
      )}
      {/* Lane sits first because picking the second champion fires the lookup —
          by then the lane needs to already be right. */}
      <Select value={lane} onValueChange={(value) => setLane(value as LolalyticsLane)}>
        <SelectTrigger aria-label="Lane" className={stacked ? "w-full" : "w-24 shrink-0"}>
          <SelectValue>
            {(value: LolalyticsLane) => LOLALYTICS_LANES.find((l) => l.value === value)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {LOLALYTICS_LANES.map((l) => (
            <SelectItem key={l.value} value={l.value}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ChampionCombobox
        label="Champion"
        champions={champions}
        version={version}
        selected={champion}
        onSelect={(c) => handleSelect("champion", c)}
        onEnter={submit}
        className={fieldClass}
      />
      <span className={cn("shrink-0 text-xs text-grey-mid", stacked && "px-0.5")}>vs</span>
      <ChampionCombobox
        label="Against"
        champions={champions}
        version={version}
        selected={opponent}
        onSelect={(c) => handleSelect("opponent", c)}
        onEnter={submit}
        className={fieldClass}
      />
      {stacked ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={submit}
          disabled={!champion || !opponent}
          className="mt-0.5"
        >
          Open on Lolalytics
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={submit}
          disabled={!champion || !opponent}
          aria-label="Open matchup on Lolalytics"
          title="Open matchup on Lolalytics"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
