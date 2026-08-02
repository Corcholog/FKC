"use client";

import { useState } from "react";
import Image from "next/image";
import { championDisplayName, championIconUrl, type ChampionInfo } from "@/lib/ddragon";
import { matchupWinRate, type MatchupAgg } from "@/lib/matchups";
import { formatKdaRatio } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Lane matchups — the tracked player's record against each enemy champion they
// were laned against. Built from the enemy participant rows that were already
// being stored and never aggregated anywhere until now.
//
// This list has no natural ceiling: a player who moves around the roster can
// face thirty-plus different champions, and one per lane opponent per game means
// it only ever grows. So it shows the most-played few and puts the rest behind
// a toggle, rather than slicing silently — a truncated list that doesn't say
// it's truncated reads as "these are all of them".
//
// Expanded, it scrolls inside a fixed height instead of growing the card. On the
// player page this sits in a two-column grid beside the role split, and a
// thirty-row card would blow that layout apart.

const DEFAULT_LIMIT = 8;

export function MatchupList({
  matchups,
  version,
  championMap,
  limit = DEFAULT_LIMIT,
}: {
  /** Pre-sorted by matchupsForPlayer: most games first, ties to the better record. */
  matchups: MatchupAgg[];
  version: string;
  championMap: Map<number, ChampionInfo>;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (matchups.length === 0) {
    return (
      <p className="text-sm text-grey-mid">
        No lane matchups yet — Riot only reports a lane when it can work out both roles.
      </p>
    );
  }

  const hasMore = matchups.length > limit;
  const visible = hasMore && !expanded ? matchups.slice(0, limit) : matchups;

  return (
    <div className="flex flex-col gap-2">
      <ul
        className={cn(
          "flex flex-col gap-1",
          // Only scroll once expanded — a collapsed list is short by
          // construction and a scrollbar on it would be noise.
          expanded && "max-h-96 overflow-y-auto pr-1",
        )}
      >
        {visible.map((matchup) => {
          const winRate = matchupWinRate(matchup);
          const icon = championIconUrl(matchup.championId, version, championMap);
          const name = championDisplayName(matchup.championId, championMap, matchup.championName);
          const kda = (matchup.kills + matchup.assists) / Math.max(matchup.deaths, 1);

          return (
            <li
              key={matchup.championId}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-bg-tertiary"
            >
              {icon ? (
                <Image src={icon} alt="" width={24} height={24} className="rounded shrink-0" />
              ) : (
                <span className="h-6 w-6 shrink-0 rounded bg-bg-tertiary" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-white">{name}</span>
              <span className="shrink-0 text-xs tabular-nums text-grey-mid">
                {formatKdaRatio(kda)} KDA
              </span>
              <span
                className={cn(
                  "w-16 shrink-0 text-right text-sm tabular-nums font-medium",
                  winRate >= 50 ? "text-win" : "text-loss",
                )}
              >
                {matchup.wins}W {matchup.games - matchup.wins}L
              </span>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((open) => !open)}
          className="self-start text-gold-bright"
          aria-expanded={expanded}
        >
          {expanded ? "Show fewer" : `Show all ${matchups.length}`}
        </Button>
      )}
    </div>
  );
}
