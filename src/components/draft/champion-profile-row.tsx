"use client";

import { Fragment, useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import { formatRoleShort } from "@/lib/roles";
import {
  DRAFT_ROLES,
  type ChampionCounterRow,
  type ChampionProfileFields,
  type DraftTagRow,
} from "@/lib/draft/types";
import { saveChampionProfile } from "@/app/(app)/draft/actions";
import { ChampionAvatar } from "@/components/champion-avatar";
import { ChampionCounters } from "@/components/draft/champion-counters";
import { TagMultiSelect } from "@/components/draft/tag-multi-select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };

// Roles and tags are fully controlled from `profile` — the table owns the
// live truth (see champion-profile-table.tsx) precisely so a toggle here is
// reflected in the "annotated" count and the role/tag filters immediately,
// not only after the next page load. Notes are the one field with local
// state: typing needs somewhere to live before it's committed, and committing
// on every keystroke would mean a round trip per letter.
export function ChampionProfileRowView({
  champion,
  champions,
  version,
  tags,
  profile,
  onChange,
  counters,
  readOnly = false,
}: {
  champion: Champion;
  /** Full roster — only needed once expanded, for the counter editor. */
  champions: Champion[];
  version: string;
  tags: DraftTagRow[];
  profile: ChampionProfileFields | null;
  /** Optimistic — called before the save resolves, so the parent's filters react instantly. */
  onChange: (next: ChampionProfileFields) => void;
  /** Every noted matchup, so the expanded row doesn't need its own fetch. */
  counters: ChampionCounterRow[];
  /**
   * Renders every field as text instead of a control. The row still expands —
   * reading the counters is the point of the page — it just can't write.
   */
  readOnly?: boolean;
}) {
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState(profile?.notes ?? "");
  const [expanded, setExpanded] = useState(false);

  const roles = profile?.roles ?? [];
  const tagSlugs = profile?.tags ?? [];

  function persist(next: ChampionProfileFields) {
    onChange(next);
    startSaving(async () => {
      const result = await saveChampionProfile({ championId: champion.championId, ...next });
      setError(result.error ?? null);
    });
  }

  function toggleRole(role: string) {
    const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
    persist({ roles: next, tags: tagSlugs, notes: profile?.notes ?? null });
  }

  function changeTags(next: string[]) {
    persist({ roles, tags: next, notes: profile?.notes ?? null });
  }

  function commitNotes() {
    const trimmed = notesDraft.trim() || null;
    if (trimmed === (profile?.notes ?? null)) return; // unchanged — skip the round trip
    persist({ roles, tags: tagSlugs, notes: trimmed });
  }

  return (
    <Fragment>
      <tr className="border-b border-border align-top transition-colors last:border-b-0 hover:bg-bg-tertiary/40">
        <td className="px-4 py-2.5">
          {/* The portrait and the name are the thing you scan this table by —
              everything else in a row is only meaningful once you've found the
              champion. They're a step up from the rest of the table's text for
              that reason, and the row doesn't get taller for it: the notes
              field is h-8 inside py-2.5, so a 40px portrait still fits inside
              the height the row already had. */}
          <div className="flex items-center gap-2.5">
            <ChampionAvatar champion={champion} version={version} size="md" />
            {/* The column is sized for the longest name, so this never
                actually truncates — it's here so a future champion with a
                longer one degrades to an ellipsis rather than wrapping and
                making this row taller than its neighbours. */}
            <span className="truncate text-base font-medium text-white">{champion.name}</span>
          </div>
        </td>
        <td className="px-4 py-2.5">
          {/* Read-only shows only the roles this champion actually has. The
              editable version has to show all five, because an unset one is
              the control you click to set it; a public page listing five greyed
              roles per champion would just be noise. */}
          <div className="flex flex-wrap gap-1">
            {readOnly
              ? roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-sm border border-gold bg-gold-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-gold-bright uppercase"
                  >
                    {formatRoleShort(role)}
                  </span>
                ))
              : DRAFT_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    aria-pressed={roles.includes(role)}
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase transition-colors",
                      roles.includes(role)
                        ? "border-gold bg-gold-muted/30 text-gold-bright"
                        : "border-border text-grey-mid hover:text-grey-light",
                    )}
                  >
                    {formatRoleShort(role)}
                  </button>
                ))}
          </div>
        </td>
        {/* No min-w on either: the header cells own every width now (see the
            comment on the table), and a min-width here would fight table-fixed
            for control of the column. */}
        <td className="px-4 py-2.5">
          {readOnly ? (
            <div className="flex flex-wrap gap-1">
              {tagSlugs.map((slug) => (
                <span
                  key={slug}
                  className="rounded-sm bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-grey-light"
                >
                  {tags.find((t) => t.slug === slug)?.label ?? slug}
                </span>
              ))}
            </div>
          ) : (
            <TagMultiSelect tags={tags} kind="function" selected={tagSlugs} onChange={changeTags} max={12} />
          )}
        </td>
        <td className="px-4 py-2.5">
          {readOnly ? (
            <p className="text-sm text-grey-light">{profile?.notes}</p>
          ) : (
            <Input
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={commitNotes}
              placeholder="Notes"
              aria-label={`Notes for ${champion.name}`}
              className="h-8 text-sm"
            />
          )}
        </td>
        <td className="px-2 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1.5">
            {saving && (
              <span aria-hidden className="text-[10px] text-grey-mid">
                …
              </span>
            )}
            {!saving && error && (
              <span title={error} className="text-xs text-loss">
                !
              </span>
            )}
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              aria-label={expanded ? `Hide counters for ${champion.name}` : `Show counters for ${champion.name}`}
              className="rounded-sm p-0.5 text-grey-mid transition-colors hover:text-grey-light"
            >
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border last:border-b-0">
          <td colSpan={5} className="p-0">
            <ChampionCounters
              champion={champion}
              champions={champions}
              version={version}
              allCounters={counters}
              readOnly={readOnly}
            />
          </td>
        </tr>
      )}
    </Fragment>
  );
}
