"use client";

import type { ChampionInfo } from "@/lib/ddragon";
import type { ChampionCounterRow } from "@/lib/draft/types";
import { ChampionAvatar } from "@/components/champion-avatar";

type Champion = ChampionInfo & { championId: number };

/**
 * One side of a champion's matchups, rendered as a list of the champions on the
 * *other* side — which side that is comes from `otherSideOf`, so the same
 * component renders "good picks against X" and "X is a good pick against"
 * without knowing which it's doing.
 *
 * Lifted out of champion-counters.tsx once the counters page grew cards that
 * show the same thing: an entry is an avatar, a name and the note explaining
 * why, and the two surfaces should never drift on that.
 */
export function CounterList({
  rows,
  championById,
  version,
  otherSideOf,
  onOpen,
  emptyLabel,
}: {
  rows: ChampionCounterRow[];
  championById: Map<number, Champion>;
  version: string;
  /** Which id on the row is the champion to show — the reading direction. */
  otherSideOf: (row: ChampionCounterRow) => number;
  onOpen: () => void;
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
            {/* Opens the same list-for-this-champion editor as "Add" — a single
                entry is a group of one, and editing/removing it is editing the
                list. */}
            <button
              type="button"
              onClick={onOpen}
              className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left hover:bg-bg-tertiary/40"
            >
              <ChampionAvatar champion={other} version={version} size="sm" />
              <span className="shrink-0 truncate text-sm text-grey-light">{other.name}</span>
              {/* Truncated to one line so a long note can't stretch a card;
                  the full text is on the title, and editing shows all of it. */}
              {row.note && (
                <span title={row.note} className="truncate text-xs text-grey-mid">
                  — {row.note}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
