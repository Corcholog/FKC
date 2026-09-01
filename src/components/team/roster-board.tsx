"use client";

import { useState } from "react";
import Link from "next/link";
import { DEFAULT_SOURCE, SOURCE_LABELS, SOURCE_NAMES, type SourceName } from "@/lib/scope";
import type { ChampionInfo } from "@/lib/ddragon";
import type { RosterBoard as Board } from "@/lib/loaders/roster-board";
import { RosterCard } from "@/components/team/roster-card";
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
                "label-nav px-2.5 py-1 transition-colors",
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <RosterCard
            key={card.id}
            card={card}
            version={version}
            championMap={championMap}
            // MVP compares our players inside one game, so a source that only
            // ever has one of us in a game cannot produce one. See the prop's
            // own comment for why that hides the pair rather than showing 0.
            showAwards={source !== "soloq"}
          />
        ))}
      </div>
    </section>
  );
}
