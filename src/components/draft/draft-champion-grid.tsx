"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { suggest } from "@/lib/champion-search";
import type { ChampionInfo } from "@/lib/ddragon";
import { DRAFT_ROLES, type ChampionProfileRow } from "@/lib/draft/types";
import { ChampionAvatar } from "@/components/champion-avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };
const ALL_ROLES = "__all__";

/**
 * The centre grid: every champion, all the time.
 *
 * Unavailable champions are greyed rather than filtered out, the same call
 * ChampionCombobox documents and for the same reason — seeing that Ahri is
 * already banned is information, and an entry that vanishes reads as a bug.
 *
 * On performance, once: there are ~170 champions, and availability is one
 * `Set.has` per tile. A full re-render is ~170 hash lookups over DOM nodes that
 * already exist and only change a class. There is deliberately no
 * virtualisation, no per-tile memo and no debounce on the search — every
 * plausible culprit here is cheaper than the profiler you'd need to find it.
 */
export function DraftChampionGrid({
  champions,
  version,
  unavailable,
  profiles,
  onPick,
  activeSlotLabel,
}: {
  champions: Champion[];
  version: string;
  /** Already on the board — greyed and unclickable. */
  unavailable: Set<number>;
  /** Phase 1's annotations, for the role filter. Empty is fine. */
  profiles: ChampionProfileRow[];
  onPick: (championId: number) => void;
  /** Where a click will land, named in the hint. Null when no slot is active. */
  activeSlotLabel: string | null;
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);

  const rolesByChampion = useMemo(
    () => new Map(profiles.map((p) => [p.champion_id, p.roles])),
    [profiles],
  );

  const shown = useMemo(() => {
    let list = suggest(champions, query);
    if (roleFilter !== ALL_ROLES) {
      list = list.filter((c) => rolesByChampion.get(c.championId)?.includes(roleFilter));
    }
    return list;
  }, [champions, query, roleFilter, rolesByChampion]);

  return (
    <div className="panel-hex flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2" data-export-hide>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-grey-mid" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search champions"
            className="pl-8"
          />
        </div>
        {/* Only when Phase 1 has actually annotated something — a row of role
            buttons that filters everything down to nothing is worse than no
            row at all. */}
        {profiles.length > 0 && (
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
        )}
      </div>

      <div className="flex max-h-[26rem] flex-wrap content-start gap-1 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="p-2 text-sm text-grey-mid">No champion matches that.</p>
        ) : (
          shown.map((champion) => {
            const taken = unavailable.has(champion.championId);
            return (
              <button
                key={champion.championId}
                type="button"
                onClick={() => !taken && onPick(champion.championId)}
                aria-disabled={taken}
                title={taken ? `${champion.name} — already on the board` : champion.name}
                className={cn(
                  "rounded-sm p-0.5 transition-colors",
                  taken ? "cursor-not-allowed" : "hover:bg-bg-tertiary/60",
                )}
              >
                <ChampionAvatar
                  champion={champion}
                  version={version}
                  size="lg"
                  dimmed={taken}
                />
              </button>
            );
          })
        )}
      </div>

      <p className="text-xs text-grey-mid" data-export-hide>
        {activeSlotLabel ? (
          <>
            Clicking a champion fills{" "}
            <span className="text-grey-light">{activeSlotLabel}</span>, then moves to the next
            empty slot on that side. Right-click a slot to empty it.
          </>
        ) : (
          <>Pick a slot on the board first, then click a champion.</>
        )}
      </p>
    </div>
  );
}
