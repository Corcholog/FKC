"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { championIconUrlById, type ChampionInfo } from "@/lib/ddragon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Extracted from matchup-search.tsx, which was its only user until the scrim
// draft form needed the same thing twenty times on a page. Behaviour is
// unchanged; the two additions are the generic parameter (so callers can pass
// champions carrying their numeric id) and `isDisabled`.

// Every match, not a top-N slice — the list scrolls, so an empty field is a
// browsable roster. Prefix hits come first so "sh" offers Shen before Ashe, and
// the codename is searchable too ("kaisa", "monkeyking").
export function suggest<C extends ChampionInfo>(champions: C[], query: string): C[] {
  const q = query.trim().toLowerCase();
  if (!q) return champions;

  const prefix: C[] = [];
  const rest: C[] = [];
  for (const champion of champions) {
    const name = champion.name.toLowerCase();
    const id = champion.ddragonId.toLowerCase();
    if (name.startsWith(q) || id.startsWith(q)) prefix.push(champion);
    else if (name.includes(q) || id.includes(q)) rest.push(champion);
  }
  return [...prefix, ...rest];
}

/**
 * The champion a query unambiguously identifies, or null.
 *
 * "Unambiguous" means exactly one candidate survives filtering *and* it's
 * selectable. An empty query never qualifies: it matches the whole roster, so
 * there's nothing to resolve.
 *
 * Split out from the component so the rule is testable — it's the thing that
 * decides whether typing three letters commits you to a pick.
 */
export function resolveUnique<C extends ChampionInfo>(
  champions: C[],
  query: string,
  isDisabled?: (champion: C) => boolean,
): C | null {
  if (!query.trim()) return null;
  const matches = suggest(champions, query);
  if (matches.length !== 1) return null;
  return isDisabled?.(matches[0]) ? null : matches[0];
}

export function ChampionCombobox<C extends ChampionInfo>({
  label,
  champions,
  version,
  selected,
  onSelect,
  onEnter,
  isDisabled,
  className,
  inputClassName,
}: {
  label: string;
  champions: C[];
  version: string;
  selected: C | null;
  /** Champion picked from the list, or null once the text no longer matches one. */
  onSelect: (champion: C | null) => void;
  /** Enter pressed with no suggestion highlighted. */
  onEnter?: () => void;
  /**
   * Marks a champion as unavailable — already picked or banned this game, or
   * used earlier in a fearless series. Shown greyed, not hidden: seeing that
   * Ahri is taken is information, and a vanishing list entry reads as a bug.
   */
  isDisabled?: (champion: C) => boolean;
  className?: string;
  inputClassName?: string;
}) {
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => suggest(champions, query), [champions, query]);
  const showList = open && matches.length > 0;

  // No effect syncing `query` back from `selected`. It looks like it belongs
  // here and it actively breaks typing: onChange clears the selection as soon
  // as the text stops matching a champion, so a sync effect would fire on every
  // keystroke and wipe the input. Callers that need to reset a field change its
  // React key and let it remount instead.

  // Arrow keys walk the whole roster, so drag the highlight into view with them.
  useEffect(() => {
    if (!showList) return;
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, showList]);

  function pick(champion: C) {
    if (isDisabled?.(champion)) return;
    setQuery(champion.name);
    setOpen(false);
    onSelect(champion);
  }

  /**
   * Next selectable index in `direction`, skipping disabled entries and
   * wrapping. Returns `from` unchanged if every entry is disabled, so holding
   * an arrow key on a fully-taken list can't spin forever.
   */
  function step(from: number, direction: 1 | -1): number {
    const size = matches.length;
    if (size === 0) return from;
    for (let i = 1; i <= size; i++) {
      const next = (((from + direction * i) % size) + size) % size;
      if (!isDisabled?.(matches[next])) return next;
    }
    return from;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(matches.length > 0 && isDisabled?.(matches[0]) ? step(0, 1) : 0);
        return;
      }
      setActive((i) => step(i, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && matches[active]) pick(matches[active]);
      else onEnter?.();
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
          const next = e.target.value;
          setQuery(next);
          setActive(0);
          setOpen(true);

          // Resolve as they type. Once the filter is down to one champion the
          // choice is already made, so making it saves an Enter on every one of
          // the twenty fields a game — Tab alone walks the whole draft.
          //
          // The typed text is deliberately *not* rewritten to the champion's
          // name here: "ahr" can become unique before "ahri" is finished, and
          // replacing the value mid-word would leave the trailing keystrokes
          // appending to it ("Ahrii") and un-match what was just matched. The
          // field shows the resolved champion's icon immediately, and onBlur
          // tidies the text once typing has actually stopped.
          const unique = resolveUnique(champions, next, isDisabled);
          if (unique) {
            if (unique.ddragonId !== selected?.ddragonId) onSelect(unique);
          } else if (selected) {
            // A half-typed name isn't a champion — drop the pick until they land on one.
            onSelect(null);
          }
        }}
        // Opening on pointer/typing rather than focus: the mobile sheet moves
        // focus into its first field when it mounts, and that shouldn't read as
        // the user having clicked into the search box.
        onPointerDown={() => setOpen(true)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          setOpen(false);
          // Show what was chosen, not the fragment that chose it — a field
          // reading "ahr" next to Ahri's icon looks like an unfinished edit.
          if (selected) setQuery(selected.name);
        }}
        onKeyDown={handleKeyDown}
        placeholder={label}
        aria-label={label}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className={cn("h-8 text-sm", selected && "pl-8", inputClassName)}
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
          {matches.map((champion, i) => {
            const disabled = isDisabled?.(champion) ?? false;
            return (
              <li key={champion.ddragonId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={disabled}
                  data-active={i === active}
                  onMouseEnter={() => !disabled && setActive(i)}
                  onClick={() => pick(champion)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors",
                    disabled
                      ? "cursor-not-allowed text-grey-mid/50"
                      : i === active
                        ? "bg-gold-muted/30 text-gold-bright"
                        : "text-grey-light",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- tiny list icons, next/image overhead isn't worth it here */}
                  <img
                    src={championIconUrlById(champion.ddragonId, version)}
                    alt=""
                    loading="lazy"
                    className={cn("h-5 w-5 shrink-0 rounded-sm", disabled && "grayscale opacity-40")}
                  />
                  <span className="truncate">{champion.name}</span>
                  {disabled && <span className="ml-auto shrink-0 text-[10px] uppercase">taken</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
