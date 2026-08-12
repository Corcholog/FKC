"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import { DRAFT_ROLES, type ChampionCounterRow, type ChampionProfileRow } from "@/lib/draft/types";
import { ChampionAvatar } from "@/components/champion-avatar";
import { CounterGroupEditor } from "@/components/draft/counter-group-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };
const ALL_ROLES = "__all__";

// A CSS-grid-in-a-table matrix, same spirit as insights/duo-matrix.tsx — real
// numbers (well, a directed relation) matter more than the shape, so plain
// markup beats a charting library. The axis is *sparse*: only champions that
// appear in at least one relation, on both rows and columns. A full 170x170
// grid is 28,900 cells and unreadable at any zoom; this one starts empty and
// grows with use.
//
// The plan called for a search that scrolls to and highlights a row. This
// implements the highlight without the scroll — a ring on matching headers,
// no DOM refs or scroll-into-view wiring. Cheaper to get right, and the axis
// is expected to stay small enough that "highlighted but not scrolled to" is
// still trivial to spot.
export function CounterMatrix({
  champions,
  version,
  counters,
  profiles,
}: {
  champions: Champion[];
  version: string;
  counters: ChampionCounterRow[];
  profiles: ChampionProfileRow[];
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);
  // Every entry point opens the same "good picks against X" editor: a matrix
  // cell picks the column as X (a row/column pair is always "row counters
  // column", so the column is the target either way); the toolbar button
  // leaves championId unset and lets the dialog ask first.
  const [editorTarget, setEditorTarget] = useState<{ championId?: number } | null>(null);

  const rolesByChampion = useMemo(() => new Map(profiles.map((p) => [p.champion_id, p.roles])), [profiles]);

  const byPair = useMemo(() => {
    const map = new Map<string, ChampionCounterRow>();
    for (const row of counters) map.set(`${row.counter_champion_id}:${row.target_champion_id}`, row);
    return map;
  }, [counters]);

  const axis = useMemo(() => {
    const ids = new Set<number>();
    for (const row of counters) {
      ids.add(row.counter_champion_id);
      ids.add(row.target_champion_id);
    }
    let list = champions.filter((c) => ids.has(c.championId));
    if (roleFilter !== ALL_ROLES) {
      list = list.filter((c) => rolesByChampion.get(c.championId)?.includes(roleFilter));
    }
    return list;
  }, [champions, counters, roleFilter, rolesByChampion]);

  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(axis.filter((c) => c.name.toLowerCase().includes(q)).map((c) => c.championId));
  }, [axis, query]);

  // Genuinely empty — no counters at all, and no filter is narrowing an
  // otherwise non-empty axis down to nothing. This is content, not an early
  // return: the CounterGroupEditor mount point at the bottom of this
  // component has to render either way, or "Add responses" from this state
  // sets editorTarget and nothing happens, because the very next render hits
  // this same branch again and never reaches the editor.
  const isEmpty = axis.length === 0 && roleFilter === ALL_ROLES && query === "";

  return (
    <div className="flex flex-col gap-3">
      {isEmpty ? (
        <div className="panel-hex flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-grey-light">No matchups noted yet.</p>
          <p className="max-w-md text-xs text-grey-mid">
            Champions show up here once at least one matchup is added — either from this page
            or from a champion&apos;s row on the Champions tab.
          </p>
          <Button type="button" size="sm" className="mt-1" onClick={() => setEditorTarget({})}>
            <Plus /> Add responses to a champion
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-grey-mid" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a champion"
                  className="w-48 pl-8"
                />
              </div>
              <div className="flex items-center gap-1">
                {DRAFT_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setRoleFilter((r) => (r === role ? ALL_ROLES : role))}
                    aria-pressed={roleFilter === role}
                    className={cn(
                      "rounded-sm border px-1.5 py-1 text-[10px] font-medium uppercase transition-colors",
                      roleFilter === role
                        ? "border-gold bg-gold-muted/30 text-gold-bright"
                        : "border-border text-grey-mid hover:text-grey-light",
                    )}
                  >
                    {role.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <Button type="button" size="sm" onClick={() => setEditorTarget({})}>
              <Plus /> Add responses to a champion
            </Button>
          </div>

          <p className="text-xs text-grey-mid">
            Rows counter the columns — read <span className="text-grey-light">Renekton row → Nasus column</span> as
            &quot;Renekton counters Nasus.&quot; Click any cell to see or add every response noted against that
            column&apos;s champion.
          </p>

          {axis.length === 0 ? (
            <p className="p-6 text-center text-sm text-grey-mid">No champion matches those filters.</p>
          ) : (
            <div className="panel-hex overflow-auto">
              <table className="border-separate border-spacing-0.5 text-sm">
                <thead>
                  <tr>
                    <th className="sticky top-0 left-0 z-20 w-9 bg-bg-secondary" />
                    {axis.map((col) => (
                      <th
                        key={col.championId}
                        scope="col"
                        title={col.name}
                        className="sticky top-0 z-10 bg-bg-secondary px-0.5 pb-1"
                      >
                        <ChampionAvatar
                          champion={col}
                          version={version}
                          size="sm"
                          className={cn(
                            "mx-auto h-6 w-6",
                            matchIds && (matchIds.has(col.championId) ? "ring-2 ring-gold" : "opacity-40"),
                          )}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {axis.map((row) => (
                    <tr key={row.championId}>
                      <th scope="row" title={row.name} className="sticky left-0 z-10 bg-bg-secondary px-0.5">
                        <ChampionAvatar
                          champion={row}
                          version={version}
                          size="sm"
                          className={cn(
                            "h-6 w-6",
                            matchIds && (matchIds.has(row.championId) ? "ring-2 ring-gold" : "opacity-40"),
                          )}
                        />
                      </th>
                      {axis.map((col) => {
                        if (row.championId === col.championId) {
                          return <td key={col.championId} className="h-6 w-6 rounded bg-bg-primary/60" />;
                        }
                        const match = byPair.get(`${row.championId}:${col.championId}`);
                        const label = match
                          ? `${row.name} counters ${col.name}${match.note ? `: ${match.note}` : ""}`
                          : `${row.name} vs ${col.name} — no matchup noted`;
                        return (
                          <td key={col.championId} className="h-6 w-6 rounded p-0 text-center">
                            <button
                              type="button"
                              title={label}
                              aria-label={label}
                              aria-haspopup="dialog"
                              onClick={() => setEditorTarget({ championId: col.championId })}
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10",
                                match ? "bg-gold-muted/40" : "bg-bg-tertiary/60",
                              )}
                            >
                              {match && (
                                <span
                                  className={cn(
                                    "size-1.5 rounded-full",
                                    match.note ? "bg-gold-bright" : "bg-gold",
                                  )}
                                />
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
          )}
        </>
      )}

      {editorTarget && (
        <CounterGroupEditor
          key={editorTarget.championId ?? "new"}
          champions={champions}
          version={version}
          counters={counters}
          direction="counteredBy"
          fixedChampionId={editorTarget.championId}
          onClose={() => setEditorTarget(null)}
        />
      )}
    </div>
  );
}
