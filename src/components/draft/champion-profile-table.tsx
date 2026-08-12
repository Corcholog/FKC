"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { suggest } from "@/lib/champion-search";
import type { ChampionInfo } from "@/lib/ddragon";
import { formatRoleShort } from "@/lib/roles";
import {
  DRAFT_ROLES,
  isEmptyProfile,
  type ChampionCounterRow,
  type ChampionProfileFields,
  type ChampionProfileRow,
  type DraftTagRow,
} from "@/lib/draft/types";
import { ChampionProfileRowView } from "@/components/draft/champion-profile-row";
import { TagManagerDialog } from "@/components/draft/tag-manager-dialog";
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
type AnnotatedFilter = "all" | "annotated";
const ALL_TAGS = "__all__";
const ALL_ROLES = "__all__";

function seedProfileMap(profiles: ChampionProfileRow[]): Map<number, ChampionProfileFields> {
  return new Map(profiles.map((p) => [p.champion_id, { roles: p.roles, tags: p.tags, notes: p.notes }]));
}

export function ChampionProfileTable({
  champions,
  version,
  functionTags,
  profiles,
  counters,
}: {
  /** realChampions(map) — alphabetical, numeric id kept. */
  champions: Champion[];
  version: string;
  functionTags: DraftTagRow[];
  /** Plain array — Map doesn't survive the server/client prop boundary. */
  profiles: ChampionProfileRow[];
  /** Every noted matchup — passed straight through to whichever row expands. */
  counters: ChampionCounterRow[];
}) {
  const [query, setQuery] = useState("");
  const [annotatedFilter, setAnnotatedFilter] = useState<AnnotatedFilter>("all");
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);
  const [tagFilter, setTagFilter] = useState(ALL_TAGS);

  // The live truth for every row, editable optimistically from row callbacks
  // so "annotated" and the role/tag filters react the instant someone toggles
  // something — not only after the next full page load. Seeded from `profiles`
  // and *resynced* whenever that prop gets a new reference (a router.refresh(),
  // e.g. from the tag manager dialog deleting a tag out from under some other
  // row). This is the render-time "adjust state when a prop changes" pattern
  // rather than a useEffect, precisely so an external change wins over
  // whatever a row last reported without an extra render or a lint fight.
  const [profileMap, setProfileMap] = useState(() => seedProfileMap(profiles));
  const [seededFrom, setSeededFrom] = useState(profiles);
  if (seededFrom !== profiles) {
    setSeededFrom(profiles);
    setProfileMap(seedProfileMap(profiles));
  }

  function updateProfile(championId: number, next: ChampionProfileFields) {
    setProfileMap((prev) => {
      const map = new Map(prev);
      if (isEmptyProfile(next)) map.delete(championId);
      else map.set(championId, next);
      return map;
    });
  }

  const filtered = useMemo(() => {
    let list = suggest(champions, query);
    if (annotatedFilter === "annotated") list = list.filter((c) => profileMap.has(c.championId));
    if (roleFilter !== ALL_ROLES) {
      list = list.filter((c) => profileMap.get(c.championId)?.roles.includes(roleFilter));
    }
    if (tagFilter !== ALL_TAGS) {
      list = list.filter((c) => profileMap.get(c.championId)?.tags.includes(tagFilter));
    }
    return list;
  }, [champions, query, annotatedFilter, roleFilter, tagFilter, profileMap]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">
          Champions
          <span className="ml-2 tabular-nums text-grey-mid normal-case">
            {profileMap.size} of {champions.length} annotated
          </span>
        </h2>
        <TagManagerDialog tags={functionTags} kind="function" label="Manage function tags" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-grey-mid" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search champions"
            className="w-56 pl-8"
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={annotatedFilter === "all" ? "default" : "outline"}
            onClick={() => setAnnotatedFilter("all")}
          >
            All
          </Button>
          <Button
            type="button"
            size="sm"
            variant={annotatedFilter === "annotated" ? "default" : "outline"}
            onClick={() => setAnnotatedFilter("annotated")}
          >
            Annotated
          </Button>
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
              {formatRoleShort(role)}
            </button>
          ))}
        </div>

        <Select value={tagFilter} onValueChange={(v) => setTagFilter(v as string)}>
          <SelectTrigger className="w-40">
            <SelectValue>
              {(value: string) =>
                value === ALL_TAGS ? "Any tag" : (functionTags.find((t) => t.slug === value)?.label ?? "Any tag")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TAGS}>Any tag</SelectItem>
            {functionTags.map((tag) => (
              <SelectItem key={tag.slug} value={tag.slug}>
                {tag.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/*
        table-fixed below, and the header widths are the whole point of it.
        Under the default auto layout every column is sized from its content,
        so one champion carrying six tags widened the tags column for all 170
        rows and squeezed the rest — the table visibly reflowed as you
        annotated it. Fixed widths mean tags wrap onto another line inside
        their own column instead, and nothing else moves. The champion column
        is sized for the longest name ("Nunu & Willump"); notes is the one
        column left unsized, so it absorbs whatever width is going.
      */}
      <div className="panel-hex overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-grey-mid">No champion matches that.</p>
        ) : (
          <table className="w-full min-w-6xl table-fixed text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-wider text-grey-mid uppercase">
                <th className="w-52 px-4 py-2 font-medium">Champion</th>
                <th className="w-60 px-4 py-2 font-medium">Roles</th>
                <th className="w-80 px-4 py-2 font-medium">Tags</th>
                <th className="px-4 py-2 font-medium">Notes</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((champion) => (
                <ChampionProfileRowView
                  key={champion.championId}
                  champion={champion}
                  champions={champions}
                  version={version}
                  tags={functionTags}
                  profile={profileMap.get(champion.championId) ?? null}
                  onChange={(next) => updateProfile(champion.championId, next)}
                  counters={counters}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
