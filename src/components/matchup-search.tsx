"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { championIconUrlById, type ChampionInfo } from "@/lib/ddragon";
import {
  lolalyticsMatchupUrl,
  LOLALYTICS_LANES,
  DEFAULT_LANE,
  type LolalyticsLane,
} from "@/lib/lolalytics";
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

// Every match, not a top-N slice — the list scrolls, so an empty field is a
// browsable roster. Prefix hits come first so "sh" offers Shen before Ashe, and
// the codename is searchable too ("kaisa", "monkeyking").
function suggest(champions: ChampionInfo[], query: string): ChampionInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return champions;

  const prefix: ChampionInfo[] = [];
  const rest: ChampionInfo[] = [];
  for (const champion of champions) {
    const name = champion.name.toLowerCase();
    const id = champion.ddragonId.toLowerCase();
    if (name.startsWith(q) || id.startsWith(q)) prefix.push(champion);
    else if (name.includes(q) || id.includes(q)) rest.push(champion);
  }
  return [...prefix, ...rest];
}

function ChampionField({
  label,
  champions,
  version,
  selected,
  onSelect,
  onEnter,
  className,
}: {
  label: string;
  champions: ChampionInfo[];
  version: string;
  selected: ChampionInfo | null;
  /** Champion picked from the list, or null once the text no longer matches one. */
  onSelect: (champion: ChampionInfo | null) => void;
  /** Enter pressed with no suggestion highlighted. */
  onEnter: () => void;
  className?: string;
}) {
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => suggest(champions, query), [champions, query]);
  const showList = open && matches.length > 0;

  // Arrow keys walk the whole roster, so drag the highlight into view with them.
  useEffect(() => {
    if (!showList) return;
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, showList]);

  function pick(champion: ChampionInfo) {
    setQuery(champion.name);
    setOpen(false);
    onSelect(champion);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && matches[active]) pick(matches[active]);
      else onEnter();
    } else if (e.key === "Escape" && open) {
      // Inside the mobile sheet, Escape would otherwise close the whole menu
      // when the user only meant to dismiss the suggestions.
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      {selected && (
        // eslint-disable-next-line @next/next/no-img-element -- tiny icon, next/image overhead isn't worth it here
        <img
          src={championIconUrlById(selected.ddragonId, version)}
          alt=""
          className="pointer-events-none absolute top-1/2 left-1.5 h-5 w-5 -translate-y-1/2 rounded-sm"
        />
      )}
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
          // A half-typed name isn't a champion — drop the pick until they land on one.
          if (selected) onSelect(null);
        }}
        // Opening on pointer/typing rather than focus: the mobile sheet moves
        // focus into its first field when it mounts, and that shouldn't read as
        // the user having clicked into the search box.
        onPointerDown={() => setOpen(true)}
        onFocus={(e) => e.target.select()}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={label}
        aria-label={label}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className={cn("h-8 text-sm", selected && "pl-8")}
      />
      {showList && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={label}
          // Keep the click from blurring the input before it registers.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-full left-0 z-50 mt-1 max-h-72 w-56 max-w-[min(14rem,80vw)] overflow-y-auto rounded-lg border border-border bg-bg-secondary py-1 shadow-lg"
        >
          {matches.map((champion, i) => (
            <li key={champion.ddragonId}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(champion)}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors",
                  i === active ? "bg-gold-muted/30 text-gold-bright" : "text-grey-light",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- tiny list icons, next/image overhead isn't worth it here */}
                <img
                  src={championIconUrlById(champion.ddragonId, version)}
                  alt=""
                  loading="lazy"
                  className="h-5 w-5 shrink-0 rounded-sm"
                />
                <span className="truncate">{champion.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Lane picker plus two champion fields, opening the Lolalytics matchup page
 * (Master+) in a new tab as soon as both sides are picked. Champion list comes
 * from DDragon, so it tracks the live patch.
 */
export function MatchupSearch({
  champions,
  version,
  defaultLane = DEFAULT_LANE,
  stacked = false,
  className,
  onOpened,
}: {
  champions: ChampionInfo[];
  version: string;
  /** Prefilled lane — the signed-in player's most-played role. */
  defaultLane?: LolalyticsLane;
  /** Full-width labelled layout for the mobile menu, instead of the navbar row. */
  stacked?: boolean;
  className?: string;
  onOpened?: () => void;
}) {
  const [lane, setLane] = useState<LolalyticsLane>(defaultLane);
  const [champion, setChampion] = useState<ChampionInfo | null>(null);
  const [opponent, setOpponent] = useState<ChampionInfo | null>(null);

  function openMatchup(a: ChampionInfo, b: ChampionInfo) {
    window.open(
      lolalyticsMatchupUrl(a.ddragonId, b.ddragonId, lane),
      "_blank",
      "noopener,noreferrer",
    );
    onOpened?.();
  }

  // Picking the side that completes the pair fires straight off — that's the
  // whole request, no confirm click. The arrow re-opens the same matchup.
  function handleSelect(side: "champion" | "opponent", picked: ChampionInfo | null) {
    const next = side === "champion" ? picked : champion;
    const nextOpponent = side === "opponent" ? picked : opponent;
    setChampion(next);
    setOpponent(nextOpponent);
    if (picked && next && nextOpponent) openMatchup(next, nextOpponent);
  }

  function submit() {
    if (champion && opponent) openMatchup(champion, opponent);
  }

  const fieldClass = stacked ? "w-full" : "w-28";

  return (
    <div
      className={cn(stacked ? "flex flex-col gap-1.5" : "flex items-center gap-1.5", className)}
    >
      {stacked && (
        <span className="text-xs font-medium tracking-wide text-grey-light uppercase">
          Matchup lookup
        </span>
      )}
      {/* Lane sits first because picking the second champion fires the lookup —
          by then the lane needs to already be right. */}
      <Select value={lane} onValueChange={(value) => setLane(value as LolalyticsLane)}>
        <SelectTrigger aria-label="Lane" className={stacked ? "w-full" : "w-24 shrink-0"}>
          <SelectValue>
            {(value: LolalyticsLane) => LOLALYTICS_LANES.find((l) => l.value === value)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {LOLALYTICS_LANES.map((l) => (
            <SelectItem key={l.value} value={l.value}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ChampionField
        label="Champion"
        champions={champions}
        version={version}
        selected={champion}
        onSelect={(c) => handleSelect("champion", c)}
        onEnter={submit}
        className={fieldClass}
      />
      <span className={cn("shrink-0 text-xs text-grey-mid", stacked && "px-0.5")}>vs</span>
      <ChampionField
        label="Against"
        champions={champions}
        version={version}
        selected={opponent}
        onSelect={(c) => handleSelect("opponent", c)}
        onEnter={submit}
        className={fieldClass}
      />
      {stacked ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={submit}
          disabled={!champion || !opponent}
          className="mt-0.5"
        >
          Open on Lolalytics
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={submit}
          disabled={!champion || !opponent}
          aria-label="Open matchup on Lolalytics"
          title="Open matchup on Lolalytics"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
