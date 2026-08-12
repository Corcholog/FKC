"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { suggest } from "@/lib/champion-search";
import type { ChampionInfo } from "@/lib/ddragon";
import { formatRoleShort } from "@/lib/roles";
import type { UnavailableReason } from "@/lib/draft/board";
import { DRAFT_ROLES, type ChampionProfileRow } from "@/lib/draft/types";
import { ChampionAvatar } from "@/components/champion-avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };
const ALL_ROLES = "__all__";

// 64px, between ChampionAvatar's lg (56) and xl (80). Overridden rather than
// added to that component's scale because lg is pinned to the tier list's
// TILE_PX and xl costs too much here: this is a picker, and every step up trades
// away champions visible at once. A modest bump keeps ~70 on screen; xl would
// have shown fewer than 50.
const GRID_TILE = "h-16 w-16";

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
  inert = false,
}: {
  champions: Champion[];
  version: string;
  /**
   * Unplaceable champions and why. A Map rather than a Set because "greyed"
   * means two different things once picks carry across a series, and showing
   * one label for both would make the board lie by omission.
   */
  unavailable: Map<number, UnavailableReason>;
  /** Phase 1's annotations, for the role filter. Empty is fine. */
  profiles: ChampionProfileRow[];
  onPick: (championId: number) => void;
  /** Where a click will land, named in the hint. Null when no slot is active. */
  activeSlotLabel: string | null;
  /**
   * Synergy selection is running. The grid goes dim and unclickable — a mode
   * that both selects and edits produces accidental picks, and picking a
   * champion mid-selection would change the very slots being selected.
   */
  inert?: boolean;
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
    <div
      className={cn(
        "panel-hex flex flex-col gap-3 p-3 transition-opacity",
        inert && "pointer-events-none opacity-40",
      )}
      aria-hidden={inert}
    >
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
                {formatRoleShort(role)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Height is fixed for a given viewport but derived from it, because two
          things depend on this number and they pull opposite ways.

          Fixed rather than max-h: with max-h the panel shrank as you typed and
          the whole row — pick flanks included — resized on every keystroke.
          content-start keeps tiles at the top, so a narrow filter leaves blank
          space below rather than centring three champions in a void.

          Derived from the viewport rather than a constant: the board is only
          worth opening mid-draft if it fits on screen without scrolling, and
          the tile area is the one part that can absorb the difference. 29.5rem
          is the rest of the page — navbar, the section heading and tabs, the
          ban row, this panel's own chrome — and it dropped by 3rem when the
          controls moved into the ban panel's corner and stopped costing a row.
          The floor is what five pick slots need beside it; below that the
          flanks would overflow instead of spacing out, so a short viewport
          scrolls a little rather than squashing the board. */}

      {/* A grid with auto-fill columns, not a wrapping flex row. Flex packs
          tiles from the left and dumps every leftover pixel in one gutter
          against the scrollbar — which was routinely most of a tile wide, so it
          read as a missing column rather than as margin. `auto-fill` with a
          `1fr` max spreads that same slack evenly across the columns instead,
          and justify-items-center parks each 64px tile in the middle of its
          track. Nothing is centred as a block, so the left edge still lines up
          with the search field above it.

          4.25rem is the tile plus its p-0.5 on both sides; the track can only
          ever be wider, never narrower, so the tiles never overlap. */}
      <div className="scrollbar-panel grid h-[clamp(21.5rem,calc(100vh-29.5rem),36rem)] grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] content-start justify-items-center gap-1 overflow-y-auto p-1">
        {shown.length === 0 ? (
          // col-span-full and justify-self-start: as a plain grid item this
          // sentence would be squeezed into one 4.25rem track and centred there.
          <p className="col-span-full justify-self-start p-2 text-sm text-grey-mid">
            No champion matches that.
          </p>
        ) : (
          shown.map((champion) => {
            const reason = unavailable.get(champion.championId);
            const taken = reason !== undefined;
            const why =
              reason?.kind === "carried"
                ? `${champion.name} — played in game ${reason.game}`
                : reason
                  ? `${champion.name} — already on this board`
                  : champion.name;
            return (
              <button
                key={champion.championId}
                type="button"
                onClick={() => !taken && onPick(champion.championId)}
                aria-disabled={taken}
                title={why}
                aria-label={why}
                // The lift and the gold are only on champions you can actually
                // take: dressing up a tile that does nothing when clicked
                // promises an affordance that isn't there, so this doubles as a
                // second signal for what's still available. relative + z-10 so
                // the lifted tile sits over its neighbours instead of under
                // them, and the container's p-1 is what keeps an edge tile's
                // glow from being clipped by the scroll box.
                className={cn(
                  "relative rounded-sm p-0.5 motion-reduce:transition-none",
                  taken
                    ? "cursor-not-allowed"
                    : "champion-tile-hover hover:z-10 hover:scale-110 focus-visible:z-10 focus-visible:scale-110",
                )}
              >
                <ChampionAvatar
                  champion={champion}
                  version={version}
                  size="lg"
                  dimmed={taken}
                  className={GRID_TILE}
                />
                {/* Only the carried case gets a badge. "Taken" is legible from
                    the board itself — the champion is sitting in a slot two
                    inches away — but "your mid played this in game 1" is
                    invisible unless the tile says so. */}
                {reason?.kind === "carried" && (
                  <span className="absolute right-0.5 bottom-0.5 rounded-sm bg-bg-primary/85 px-1 text-[10px] leading-tight font-medium text-grey-light">
                    G{reason.game}
                  </span>
                )}
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
