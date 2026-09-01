"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { DraftTagKind, DraftTagRow } from "@/lib/draft/types";
import { createDraftTag } from "@/app/(app)/prep/actions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// The app's only multi-select. Everything else (ChampionCombobox, the tier
// list's champion pool) picks one thing; this picks several from a vocabulary
// that can grow in place. Chips-with-remove is new here — Badge and MetaChip
// elsewhere are display-only.
//
// Filtering and keyboard handling mirror ChampionCombobox: prefix hits first,
// arrow keys walk the list, Enter picks the active row, and the dropdown's own
// onMouseDown prevents the click from blurring the input before it registers.

function suggestTags(tags: DraftTagRow[], query: string): DraftTagRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return tags;
  const prefix: DraftTagRow[] = [];
  const rest: DraftTagRow[] = [];
  for (const tag of tags) {
    const label = tag.label.toLowerCase();
    if (label.startsWith(q)) prefix.push(tag);
    else if (label.includes(q)) rest.push(tag);
  }
  return [...prefix, ...rest];
}

export function TagMultiSelect({
  tags,
  kind,
  selected,
  onChange,
  placeholder = "Add a tag",
  max,
  disabled = false,
  className,
}: {
  /** The vocabulary for one kind, e.g. loadDraftTags(supabase, "function"). */
  tags: DraftTagRow[];
  kind: DraftTagKind;
  /** Slugs. */
  selected: string[];
  onChange: (slugs: string[]) => void;
  placeholder?: string;
  max?: number;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [creating, startCreating] = useTransition();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Tags created this session, so a freshly created tag renders as a chip
  // immediately instead of waiting for the page's server data to catch up.
  const [justCreated, setJustCreated] = useState<DraftTagRow[]>([]);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const allTags = useMemo(() => {
    const known = new Set(tags.map((t) => t.slug));
    return [...tags, ...justCreated.filter((t) => !known.has(t.slug))];
  }, [tags, justCreated]);

  const selectedTags = useMemo(
    () => selected.map((slug) => allTags.find((t) => t.slug === slug)).filter((t): t is DraftTagRow => !!t),
    [selected, allTags],
  );

  const atMax = max !== undefined && selected.length >= max;
  const matches = useMemo(
    () => suggestTags(allTags, query).filter((t) => !selected.includes(t.slug)),
    [allTags, query, selected],
  );
  const trimmed = query.trim();
  const exactMatch = allTags.some((t) => t.label.toLowerCase() === trimmed.toLowerCase());
  const canCreate = trimmed.length > 0 && !exactMatch && !atMax && !creating;
  const rowCount = matches.length + (canCreate ? 1 : 0);
  const showList = open && !atMax && rowCount > 0;

  useEffect(() => {
    if (!showList) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, showList]);

  function add(slug: string) {
    if (atMax || selected.includes(slug)) return;
    onChange([...selected, slug]);
    setQuery("");
    setActive(0);
  }

  function remove(slug: string) {
    onChange(selected.filter((s) => s !== slug));
  }

  function create() {
    if (!canCreate) return;
    const label = trimmed;
    startCreating(async () => {
      const result = await createDraftTag({ label, kind });
      if (result.error || !result.tag) {
        toast.error(result.error ?? "Could not create that tag.");
        return;
      }
      setJustCreated((prev) => [...prev, result.tag!]);
      add(result.tag.slug);
      router.refresh(); // so other rows on the page see the new tag too
    });
  }

  function step(from: number, direction: 1 | -1): number {
    if (rowCount === 0) return from;
    return (((from + direction) % rowCount) + rowCount) % rowCount;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      setActive((i) => step(i, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!showList) return;
      if (active < matches.length) add(matches[active].slug);
      else if (canCreate) create();
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      // Standard tag-input affordance: backspace against an empty field pops
      // the last chip rather than doing nothing.
      remove(selected[selected.length - 1]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <Badge key={tag.slug} variant="outline" className="gap-1 pr-1">
              {tag.label}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(tag.slug)}
                  aria-label={`Remove ${tag.label}`}
                  className="rounded-full p-0.5 hover:bg-bg-tertiary"
                >
                  <X className="size-2.5" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {!disabled && !atMax && (
        <div className="relative">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            className="h-8 text-sm"
          />
          {showList && (
            <ul
              id={listId}
              ref={listRef}
              role="listbox"
              aria-label={placeholder}
              onMouseDown={(e) => e.preventDefault()}
              className="absolute top-full left-0 z-50 mt-1 max-h-56 w-56 overflow-y-auto rounded-lg border border-border bg-bg-secondary py-1 shadow-lg"
            >
              {matches.map((tag, i) => (
                <li key={tag.slug}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => add(tag.slug)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors",
                      i === active ? "bg-gold-muted/30 text-gold-bright" : "text-grey-light",
                    )}
                  >
                    <span className="truncate">{tag.label}</span>
                  </button>
                </li>
              ))}
              {canCreate && (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active === matches.length}
                    data-active={active === matches.length}
                    onMouseEnter={() => setActive(matches.length)}
                    onClick={create}
                    disabled={creating}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors",
                      active === matches.length ? "bg-gold-muted/30 text-gold-bright" : "text-grey-light",
                    )}
                  >
                    {creating ? "Creating…" : `Create "${trimmed}"`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
