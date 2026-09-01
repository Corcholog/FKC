"use client";

import { useState } from "react";
import Link from "next/link";
import { formatKdaRatio } from "@/lib/format";
import { formatRole } from "@/lib/roles";
import { avatarTint } from "@/lib/avatar-tint";
import { championDisplayName, championIconUrl, type ChampionInfo } from "@/lib/ddragon";
import { DEFAULT_SOURCE, SOURCE_LABELS, SOURCE_NAMES, type SourceName } from "@/lib/scope";
import type { RosterBoard as Board } from "@/lib/loaders/roster-board";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { winRateTone } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// The five, across the top of the home page, with their champion pool on the
// card rather than in a section of its own.
//
// **The filter is client state, not a link**, which is the exception to this
// repo's usual rule. The rule is that a different query is a route — and this is
// not a different query: all four readings are folded server-side in one pass
// and arrive together (lib/loaders/roster-board.ts), so switching is a
// re-render with no network in it. Making it a link would put a server round
// trip behind a control whose whole job is to be flicked back and forth.
//
// One row of five on a wide screen, wrapping to two and then to one. The pool is
// the same top five the player page opens on, and the card itself is the "see
// all" — it links to the table that holds the rest.

export function RosterBoard({
  board,
  version,
  championMap,
}: {
  board: Board;
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  const [source, setSource] = useState<SourceName>(DEFAULT_SOURCE);
  const cards = board[source];

  if (cards.length === 0) {
    return (
      <section className="panel-hex p-4">
        <p className="text-sm text-grey-mid">
          No roster yet — add five players in{" "}
          <Link href="/settings" className="text-gold-bright hover:text-gold">
            Settings
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-white">Roster</h2>
        <nav className="flex flex-wrap gap-1" aria-label="Which games these numbers count">
          {SOURCE_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setSource(name)}
              aria-pressed={name === source}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                name === source
                  ? "bg-gold-muted text-white"
                  : "text-grey-light hover:bg-bg-tertiary hover:text-white",
              )}
            >
              {SOURCE_LABELS[name]}
            </button>
          ))}
        </nav>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={`/players/${card.slug}`}
            className="panel-hex group flex min-w-0 flex-col gap-2.5 p-3 transition-colors hover:border-gold-muted"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Avatar size="sm">
                {card.avatarUrl && <AvatarImage src={card.avatarUrl} alt="" />}
                <AvatarFallback style={avatarTint(card.displayName)}>
                  {card.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white transition-colors group-hover:text-gold-bright">
                  {card.displayName}
                </p>
                <p className="truncate text-[10px] font-semibold tracking-wider text-grey-mid uppercase">
                  {formatRole(card.teamRole)}
                </p>
              </div>
            </div>

            {card.games === 0 ? (
              <p className="text-[11px] text-grey-mid">No games</p>
            ) : (
              <p className="flex items-baseline gap-1.5 text-[11px] tabular-nums text-grey-mid">
                <span className={cn("text-sm font-semibold", winRateTone(card.winRate))}>
                  {card.winRate}%
                </span>
                <span>
                  {card.wins}–{card.games - card.wins}
                </span>
                {card.kda !== null && <span>· {formatKdaRatio(card.kda)} KDA</span>}
              </p>
            )}

            {/* The pool, inline. Win rate under each icon rather than on hover:
                a tooltip on a card inside a link is a fight, and the number is
                the reason the icon is there at all. */}
            <div className="flex gap-1">
              {card.champions.map((champion) => {
                const icon = championIconUrl(champion.championId, version, championMap);
                const name = championDisplayName(
                  champion.championId,
                  championMap,
                  champion.championName,
                );
                return (
                  <div
                    key={champion.championId}
                    className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
                    title={`${name} — ${champion.games} game${champion.games === 1 ? "" : "s"}, ${champion.winRate}%`}
                  >
                    {icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={icon}
                        alt={name}
                        className="h-7 w-7 rounded-md"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-md bg-gold-muted" />
                    )}
                    <span
                      className={cn(
                        "text-[9px] tabular-nums",
                        winRateTone(champion.winRate),
                      )}
                    >
                      {champion.winRate}%
                    </span>
                  </div>
                );
              })}
              {/* Keeps the row height stable when somebody has a shallow pool,
                  so the five cards stay the same height beside each other. */}
              {card.champions.length === 0 && <div className="h-7" />}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
