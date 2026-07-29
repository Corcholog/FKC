"use client";

import { useState } from "react";
import { formatPerMinute } from "@/lib/format";
import { championDisplayName, championIconUrl, type ChampionInfo } from "@/lib/ddragon";
import { championWinRate, type ChampionAgg } from "@/lib/champion-stats";
import { Button } from "@/components/ui/button";

type SortKey = "games" | "winrate";

export function ChampionTierList({
  champions,
  version,
  championMap,
}: {
  champions: ChampionAgg[];
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("games");

  const sorted = [...champions].sort((a, b) =>
    sortKey === "games" ? b.games - a.games : championWinRate(b) - championWinRate(a),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 self-end">
        <span className="text-xs text-grey-light">Sort by</span>
        <Button
          type="button"
          size="sm"
          variant={sortKey === "games" ? "default" : "outline"}
          onClick={() => setSortKey("games")}
        >
          Games
        </Button>
        <Button
          type="button"
          size="sm"
          variant={sortKey === "winrate" ? "default" : "outline"}
          onClick={() => setSortKey("winrate")}
        >
          Win rate
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-grey-mid">No tracked games yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sorted.map((champ, i) => {
            const url = championIconUrl(champ.championId, version, championMap);
            const name = championDisplayName(champ.championId, championMap, champ.championName);
            const winRate = championWinRate(champ);

            return (
              <div
                key={champ.championId}
                className="panel-hex relative flex flex-col items-center gap-1.5 p-4 text-center"
              >
                <span className="absolute top-2.5 left-3 text-xs tabular-nums text-grey-mid">{i + 1}</span>
                {url ? (
                  <img src={url} alt={name} title={name} className="h-14 w-14 rounded-lg" />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-gold-muted" />
                )}
                <p className="w-full truncate text-sm font-medium text-white">{name}</p>
                <p className="font-heading tabular-nums text-xl font-semibold text-white">{winRate}%</p>
                <p className="tabular-nums text-xs text-grey-light">{champ.games} games</p>
                <div className="flex gap-2 text-xs text-grey-light">
                  <span className="tabular-nums">
                    {formatPerMinute(champ.totalCs, champ.totalDurationSeconds)} CS/min
                  </span>
                  <span className="tabular-nums">
                    {formatPerMinute(champ.totalDamage, champ.totalDurationSeconds)} dmg/min
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
