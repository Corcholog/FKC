"use client";

import { useMemo, useState } from "react";
import { duoWinRate, MIN_DUO_GAMES, type DuoRecord } from "@/lib/duo-stats";
import { StatRankingDialog, type RankRow } from "@/components/stat-ranking";

// A CSS-grid matrix, not a Recharts chart — this is a small table of numbers
// where the exact value matters more than the shape, and every cell is labelled.
//
// Colour is diverging around 50% (the point where a duo stops helping): one
// hue above, one below, neutral grey in the middle. The number is always
// printed, so colour is reinforcement rather than the only encoding.
//
// The grid answers "how does this pair do"; it doesn't answer "is that good".
// Clicking any cell opens every pair in order, with the clicked one marked.

export type MatrixPlayer = {
  id: string;
  display_name: string;
};

function cellTone(winRate: number, games: number) {
  if (games === 0) return "bg-bg-tertiary text-grey-mid";
  if (winRate >= 60) return "bg-win/20 text-win";
  if (winRate <= 40) return "bg-loss/20 text-loss";
  return "bg-bg-tertiary text-white";
}

export function DuoMatrix({
  players,
  duos,
}: {
  players: MatrixPlayer[];
  duos: DuoRecord[];
}) {
  // Null while closed. Open on a cell for a pair that never queued carries a
  // null `pair` — the standings are still worth reaching from there, there is
  // just no row to mark.
  const [open, setOpen] = useState<{ pair: string | null } | null>(null);

  const byPair = useMemo(() => {
    const map = new Map<string, DuoRecord>();
    for (const duo of duos) {
      map.set(`${duo.a}|${duo.b}`, duo);
      map.set(`${duo.b}|${duo.a}`, duo);
    }
    return map;
  }, [duos]);

  // Every pair that has actually queued together, best winrate first. Pairs
  // under the sample-size gate keep their place at the bottom un-numbered
  // rather than being hidden — the same rule the caption states, made visible.
  const ranking = useMemo<RankRow[]>(() => {
    const nameOf = (id: string) => players.find((p) => p.id === id)?.display_name ?? "Unknown";

    return [...duos]
      .filter((duo) => duo.games > 0)
      .sort((a, b) => {
        const gateA = a.games >= MIN_DUO_GAMES;
        const gateB = b.games >= MIN_DUO_GAMES;
        if (gateA !== gateB) return gateA ? -1 : 1;
        return duoWinRate(b) - duoWinRate(a);
      })
      .map((duo) => ({
        id: `${duo.a}|${duo.b}`,
        name: `${nameOf(duo.a)} + ${nameOf(duo.b)}`,
        value: `${duoWinRate(duo)}%`,
        sub: `${duo.wins}W / ${duo.games - duo.wins}L`,
        unranked: duo.games < MIN_DUO_GAMES,
      }));
  }, [duos, players]);

  if (players.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-grey-mid">
        Needs at least two tracked players.
      </p>
    );
  }

  const initials = (name: string) => name.slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-0.5 text-sm">
          <thead>
            <tr>
              <th className="w-24" />
              {players.map((p) => (
                <th
                  key={p.id}
                  scope="col"
                  title={p.display_name}
                  className="px-1 pb-1 text-center text-[11px] font-medium text-grey-light"
                >
                  {initials(p.display_name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((row) => (
              <tr key={row.id}>
                <th
                  scope="row"
                  className="max-w-24 truncate pr-2 text-right text-xs font-medium text-grey-light"
                >
                  {row.display_name}
                </th>
                {players.map((col) => {
                  if (row.id === col.id) {
                    return <td key={col.id} className="rounded bg-bg-primary/60" />;
                  }

                  const duo = byPair.get(`${row.id}|${col.id}`);
                  const games = duo?.games ?? 0;
                  const winRate = duo ? duoWinRate(duo) : 0;
                  const label = `${row.display_name} + ${col.display_name}: ${
                    games === 0 ? "never queued together" : `${duo!.wins}W / ${games - duo!.wins}L`
                  }`;

                  return (
                    <td
                      key={col.id}
                      className={`rounded p-0 text-center tabular-nums ${cellTone(winRate, games)}`}
                    >
                      {/* The button carries the padding so the whole cell is the
                          hit area, not just the text inside it. Empty cells are
                          buttons too — the standings are worth reaching from a
                          pair that never happened. */}
                      <button
                        type="button"
                        title={label}
                        aria-label={label}
                        aria-haspopup="dialog"
                        onClick={() => setOpen({ pair: duo ? `${duo.a}|${duo.b}` : null })}
                        className="w-full cursor-pointer rounded px-1 py-1.5 transition-colors hover:bg-white/5"
                      >
                        {games === 0 ? (
                          <span className="text-xs">—</span>
                        ) : (
                          <>
                            <span className="text-xs font-medium">{winRate}%</span>
                            <span className="block text-[10px] text-grey-mid">{games}g</span>
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-grey-mid">Click a cell to rank every pair.</p>

      <StatRankingDialog
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
        title="Duo winrates"
        description={`Every pair that has queued together, best first. Pairs under ${MIN_DUO_GAMES} games are listed but not ranked.`}
        rows={ranking.map((row) => ({ ...row, highlight: row.id === open?.pair }))}
        empty="Nobody has queued together yet."
      />
    </div>
  );
}
