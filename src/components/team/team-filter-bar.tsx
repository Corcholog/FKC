"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import {
  activeTeamMatchFilterCount,
  teamMatchFilterToQuery,
  type TeamMatchFilter,
  type TeamMatchFilterOptions,
} from "@/lib/team/filters";
import { TEAM_MATCH_KIND_LABELS } from "@/lib/team/types";
import { ChampionAvatar } from "@/components/champion-avatar";
import { ChampionCombobox } from "@/components/champion-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };
type ChampionSide = "allyChampionIds" | "enemyChampionIds";

const ANY = "__any__";

/**
 * One side's champion picker and the chips already applied.
 *
 * Top-level rather than nested inside TeamFilterBar, and not only because the
 * lint rule says so: a component declared during render is a new type on every
 * render, so React unmounts and remounts it — which would wipe the combobox's
 * typed text on every keystroke that changed the parent. `pickerKey` is the
 * *deliberate* remount, and it can only mean anything if the accidental one
 * isn't happening too.
 */
function ChampionChips({
  ids,
  label,
  champions,
  championById,
  version,
  pickerKey,
  onAdd,
  onRemove,
}: {
  ids: number[];
  label: string;
  champions: Champion[];
  championById: Map<number, Champion>;
  version: string;
  pickerKey: number;
  onAdd: (champion: Champion | null) => void;
  onRemove: (championId: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10px] font-medium tracking-wider text-grey-mid uppercase">
        {label}
      </span>
      <ChampionCombobox
        key={pickerKey}
        label={label}
        champions={champions}
        version={version}
        selected={null}
        onSelect={onAdd}
        // Greyed rather than hidden, so adding a champion twice reads as
        // "already applied" instead of the entry having vanished.
        isDisabled={(champion) => ids.includes(champion.championId)}
        className="w-full"
        inputClassName="h-8 text-sm"
      />
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ids.map((id) => {
            const champion = championById.get(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onRemove(id)}
                className="flex items-center gap-1 rounded-full border border-border bg-bg-tertiary/60 py-0.5 pr-2 pl-0.5 text-xs text-grey-light transition-colors hover:border-loss/50 hover:text-white"
                title={`Remove ${champion?.name ?? id}`}
              >
                {champion && <ChampionAvatar champion={champion} version={version} size="sm" />}
                <span className={cn("max-w-24 truncate", !champion && "pl-1.5")}>
                  {/* An id with no DDragon entry still renders as a chip: it is
                      an active filter, and a filter you can see but not remove
                      is worse than an ugly one. */}
                  {champion?.name ?? `#${id}`}
                </span>
                <X className="h-3 w-3 shrink-0 opacity-60" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The filter that drives the whole team page.
 *
 * Every control writes to the URL rather than to component state, so the page
 * re-renders on the server with a new `searchParams` and every aggregate below
 * it recomputes from the same filtered array. That keeps the aggregation where
 * the rest of this codebase keeps it — in pure functions on the server — and
 * makes a filtered view something you can send to somebody.
 *
 * The two champion pickers are the reason this page exists. Everything else
 * narrows a range; those two ask "what happened when this was on the map", and
 * they are additive: each pick you add is another champion that must have been
 * there, so the set shrinks toward the specific game you remember.
 */
export function TeamFilterBar({
  filter,
  options,
  champions,
  version,
  basePath = "",
  resultCount,
  totalCount,
}: {
  filter: TeamMatchFilter;
  options: TeamMatchFilterOptions;
  champions: Champion[];
  version: string;
  basePath?: string;
  resultCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  // Remounting a combobox is how it clears — they deliberately hold no effect
  // syncing text back from `selected`. See champion-combobox.tsx.
  //
  // One counter per side rather than one shared. They are two independent
  // boxes, and a shared counter remounts both: adding a champion to "we played"
  // would wipe half-typed text out of "we faced".
  const [pickerKeys, setPickerKeys] = useState<Record<ChampionSide, number>>({
    allyChampionIds: 0,
    enemyChampionIds: 0,
  });

  const championById = new Map(champions.map((c) => [c.championId, c]));
  const active = activeTeamMatchFilterCount(filter);

  function go(next: TeamMatchFilter) {
    router.push(`${basePath}/team/scouting${teamMatchFilterToQuery(next)}`);
  }

  function addChampion(side: ChampionSide, champion: Champion | null) {
    if (!champion || filter[side].includes(champion.championId)) return;
    setPickerKeys((keys) => ({ ...keys, [side]: keys[side] + 1 }));
    go({ ...filter, [side]: [...filter[side], champion.championId] });
  }

  function removeChampion(side: ChampionSide, championId: number) {
    go({ ...filter, [side]: filter[side].filter((id) => id !== championId) });
  }

  return (
    <div className="panel-hex flex flex-col gap-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium tracking-wider text-grey-mid uppercase">
            Competition
          </span>
          <Select
            value={filter.kind ?? ANY}
            onValueChange={(value) =>
              go({ ...filter, kind: value === ANY ? null : (value as TeamMatchFilter["kind"]) })
            }
          >
            <SelectTrigger className="h-8 w-full text-sm">
              <SelectValue>
                {(value: string) =>
                  value === ANY ? "All" : TEAM_MATCH_KIND_LABELS[value as keyof typeof TEAM_MATCH_KIND_LABELS]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All</SelectItem>
              {options.kinds.map(({ kind, games }) => (
                <SelectItem key={kind} value={kind}>
                  {TEAM_MATCH_KIND_LABELS[kind]} ({games})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium tracking-wider text-grey-mid uppercase">
            Opponent
          </span>
          <Select
            value={filter.opponentSlug ?? ANY}
            onValueChange={(value) =>
              go({ ...filter, opponentSlug: value === ANY ? null : value })
            }
          >
            <SelectTrigger className="h-8 w-full text-sm">
              <SelectValue>
                {(value: string) =>
                  value === ANY
                    ? "All"
                    : (options.opponents.find((o) => o.slug === value)?.name ?? value)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All</SelectItem>
              {options.opponents.map((opponent) => (
                <SelectItem key={opponent.slug} value={opponent.slug}>
                  {opponent.name} ({opponent.games})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium tracking-wider text-grey-mid uppercase">
            Patch
          </span>
          <Select
            value={filter.patch ?? ANY}
            onValueChange={(value) => go({ ...filter, patch: value === ANY ? null : value })}
          >
            <SelectTrigger className="h-8 w-full text-sm">
              <SelectValue>{(value: string) => (value === ANY ? "All" : value)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All</SelectItem>
              {options.patches.map(({ patch, games }) => (
                <SelectItem key={patch} value={patch}>
                  {patch} ({games})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Named rather than silently folded into "All": a patch filter can
              never match these games, and that is worth knowing before someone
              concludes a patch went unplayed. */}
          {options.untaggedPatchGames > 0 && (
            <span className="text-[10px] text-grey-mid">
              {options.untaggedPatchGames} game
              {options.untaggedPatchGames === 1 ? "" : "s"} with no patch recorded
            </span>
          )}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium tracking-wider text-grey-mid uppercase">
            Played between
          </span>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              aria-label="From date"
              value={filter.from ?? ""}
              onChange={(e) => go({ ...filter, from: e.target.value || null })}
              className="h-8 min-w-0 flex-1 text-sm"
            />
            <span className="text-xs text-grey-mid">to</span>
            <Input
              type="date"
              aria-label="To date"
              value={filter.to ?? ""}
              onChange={(e) => go({ ...filter, to: e.target.value || null })}
              className="h-8 min-w-0 flex-1 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ChampionChips
          ids={filter.allyChampionIds}
          label="We played"
          champions={champions}
          championById={championById}
          version={version}
          pickerKey={pickerKeys.allyChampionIds}
          onAdd={(champion) => addChampion("allyChampionIds", champion)}
          onRemove={(id) => removeChampion("allyChampionIds", id)}
        />
        <ChampionChips
          ids={filter.enemyChampionIds}
          label="We faced"
          champions={champions}
          championById={championById}
          version={version}
          pickerKey={pickerKeys.enemyChampionIds}
          onAdd={(champion) => addChampion("enemyChampionIds", champion)}
          onRemove={(id) => removeChampion("enemyChampionIds", id)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-grey-mid">
          {active === 0 ? (
            <>
              Showing all <span className="text-grey-light tabular-nums">{totalCount}</span> games
            </>
          ) : (
            <>
              <span
                className={cn(
                  "tabular-nums",
                  resultCount === 0 ? "text-loss" : "text-grey-light",
                )}
              >
                {resultCount}
              </span>{" "}
              of {totalCount} games match {active} filter{active === 1 ? "" : "s"}
            </>
          )}
        </p>
        {active > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => router.push(`${basePath}/team/scouting`)}
          >
            <X />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
