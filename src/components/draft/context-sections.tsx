"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Search } from "lucide-react";
import { suggest } from "@/lib/champion-search";
import type { ChampionInfo } from "@/lib/ddragon";
import { formatRoleShort } from "@/lib/roles";
import type { Side } from "@/lib/draft/board";
import {
  annotatedCount,
  assembledSynergies,
  availableFirst,
  countersAgainst,
  countersFacing,
  matchingComps,
  nearSynergies,
  sortedTagCounts,
  tagProfile,
  type IdLookup,
} from "@/lib/draft/context";
import type {
  ChampionCounterRow,
  ChampionProfileRow,
  CounterIndex,
  DraftCompRow,
} from "@/lib/draft/types";
import { ChampionAvatar } from "@/components/champion-avatar";
import { BarRow } from "@/components/scrims/scrim-ui";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };

/**
 * Everything the sections read, assembled once by the panel.
 *
 * One bag rather than a dozen props per section: these eight values travel
 * together to all eight sections, and threading them individually turned every
 * signature into a wall that hid the one or two props that actually vary.
 */
export type PanelData = {
  champions: Champion[];
  championById: Map<number, Champion>;
  version: string;
  profiles: Map<number, ChampionProfileRow>;
  counters: ChampionCounterRow[];
  counterIndex: CounterIndex;
  /** Both kinds. The sections split by `kind` themselves. */
  comps: DraftCompRow[];
  /** slug → label, both tag kinds, so nothing here renders a raw slug. */
  tagLabels: Map<string, string>;
};

// ------------------------------------------------------------
// Shared pieces
// ------------------------------------------------------------

/**
 * One collapsible block. Open by default — a panel of shut drawers shows nothing.
 *
 * The header is a row containing a toggle button and a link, not a button
 * wrapping both: the link out to this section's home page is the panel's only
 * affordance beyond reading, and a `<a>` inside a `<button>` is invalid markup
 * that browsers resolve however they like.
 *
 * It's the *section* that links, not each row. The doc put the link on rows, but
 * a row that navigates is a trap on a surface someone opens mid-draft — one
 * mis-aimed click and the board they were reading against is off-screen. The
 * section header gets you to the same page and nothing on the panel moves under
 * the cursor.
 *
 * A bordered box rather than a divider between stacked blocks, because the
 * sections are laid out in a grid now and a shared `border-t` only reads as a
 * divider in one column. `className` is how a caller spans one across the grid.
 */
function Section({
  title,
  count,
  href,
  linkLabel,
  className,
  children,
}: {
  title: string;
  /** Omitted where a count would be meaningless. */
  count?: number;
  href: string;
  linkLabel: string;
  /** Grid placement from the panel — `col-span-*`, nothing else. */
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section
      className={cn(
        "h-fit rounded-sm border border-border bg-bg-primary/30",
        className,
      )}
    >
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-grey-mid transition-transform motion-reduce:transition-none",
              !open && "-rotate-90",
            )}
          />
          <h3 className="font-heading min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-white uppercase">
            {title}
          </h3>
          {count !== undefined && (
            <span className="shrink-0 text-[10px] tabular-nums text-grey-mid">{count}</span>
          )}
        </button>
        <Link
          href={href}
          aria-label={linkLabel}
          title={linkLabel}
          className="shrink-0 rounded-sm p-1 text-grey-mid hover:text-gold"
        >
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
      {open && <div className="flex flex-col gap-1.5 px-3 pb-3">{children}</div>}
    </section>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-medium tracking-wide text-grey-mid uppercase">{children}</h4>
  );
}

/**
 * An empty state that names what's missing and links to the page that fills it.
 *
 * Four sections each saying "Nothing yet" would tell nobody anything. "No saved
 * synergy matches these picks" and "No counters noted against Renekton" point at
 * different tables, and the link is the shortest path to doing something about
 * it.
 */
function EmptyNote({
  children,
  href,
  cta,
}: {
  children: React.ReactNode;
  href: string;
  cta: string;
}) {
  return (
    <p className="text-xs text-grey-mid">
      {children}{" "}
      <Link
        href={href}
        className="text-gold underline-offset-2 hover:text-gold-bright hover:underline"
      >
        {cta}
      </Link>
    </p>
  );
}

/** "Renekton, Nasus" — for empty states that name what they searched against. */
function nameList(ids: number[], championById: Map<number, Champion>): string {
  return ids.map((id) => championById.get(id)?.name ?? `#${id}`).join(", ");
}

/**
 * A saved comp or synergy, compressed to one panel row.
 *
 * **Not a `dense` variant of CompCard**, deliberately. That card is a card with
 * edit and delete controls, a notes toggle and a name-leads-or-champions-lead
 * rule; this is a read-only line that has to grey the champions you don't have
 * and ring the one you'd need. Sharing them would mean a `dense` prop plus an
 * optional `onEdit` plus a per-champion emphasis callback on a component whose
 * job is none of that. They share ChampionAvatar and Badge, which is the part
 * that would actually drift.
 */
function CompRow({
  comp,
  data,
  /** Per-champion emphasis. "need" is dimmed; "wanted" gets the gold ring. */
  emphasis,
  trailing,
}: {
  comp: DraftCompRow;
  data: PanelData;
  emphasis?: (championId: number) => "have" | "need" | "wanted";
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-sm px-1.5 py-1">
      <div className="flex flex-wrap items-center gap-1">
        {comp.champion_ids.map((id, i) => {
          const champion = data.championById.get(id);
          const state = emphasis?.(id) ?? "have";
          if (!champion) {
            return (
              <span
                key={`${id}-${i}`}
                title={`Unknown champion (${id})`}
                className="flex h-6 w-6 items-center justify-center rounded-sm bg-bg-tertiary text-[10px] text-grey-mid"
              >
                ?
              </span>
            );
          }
          return (
            <ChampionAvatar
              key={`${id}-${i}`}
              champion={champion}
              version={data.version}
              size="sm"
              dimmed={state === "need"}
              selected={state === "wanted"}
            />
          );
        })}
        {trailing}
      </div>

      {comp.label && <p className="truncate text-xs text-grey-light">{comp.label}</p>}

      {comp.win_conditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {comp.win_conditions.map((slug) => (
            <Badge key={slug} variant="outline" className="h-4 px-1.5 text-[10px]">
              {data.tagLabels.get(slug) ?? slug}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One noted matchup. Which champion leads depends on the question being asked.
 *
 * **Contextual leads with the counter** ("Ornn vs Jarvan"): you already know
 * what they picked — it's on the board two inches away — and the row exists to
 * name the champion you could take about it. The answer is the new information,
 * so it goes first.
 *
 * **Explore leads with the target** ("Jarvan — answered by Ornn"): nothing is on
 * the board, the search is by the champion you want beaten, and a list sorted by
 * the wrong end of each pair is a list you have to read twice. Same rows, same
 * table, opposite question.
 *
 * `gone` always greys the *counter*, whichever end it's rendered at: a counter
 * that is banned, already picked or used earlier in the series is a fact about a
 * draft nobody can have. Both contextual lists use it — an answer you can't take
 * and a threat that can't materialise are the same non-event.
 */
function CounterRow({
  row,
  data,
  gone,
  lead = "counter",
}: {
  row: ChampionCounterRow;
  data: PanelData;
  gone: boolean;
  lead?: "counter" | "target";
}) {
  const counter = data.championById.get(row.counter_champion_id);
  const target = data.championById.get(row.target_champion_id);
  if (!counter || !target) return null;

  const leads = lead === "counter" ? counter : target;
  const trails = lead === "counter" ? target : counter;
  // The strike-through follows the counter, not the position, so a greyed row in
  // Explore still marks the champion that can't be taken.
  const leadGone = gone && lead === "counter";
  const trailGone = gone && lead === "target";

  return (
    <div className="flex items-start gap-2 rounded-sm px-1.5 py-1">
      <ChampionAvatar champion={leads} version={data.version} size="sm" dimmed={leadGone} />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1 text-xs">
          <span
            className={cn("truncate", leadGone ? "text-grey-mid line-through" : "text-grey-light")}
          >
            {leads.name}
          </span>
          <span className="shrink-0 text-[10px] text-grey-mid">
            {lead === "counter" ? "vs" : "←"}
          </span>
          <span
            className={cn(
              "truncate text-[11px]",
              trailGone ? "text-grey-mid line-through" : "text-grey-mid",
            )}
          >
            {trails.name}
          </span>
        </p>
        {row.note && <p className="line-clamp-2 text-[11px] text-grey-mid">{row.note}</p>}
      </div>
    </div>
  );
}

/** The search box every Explore section carries. */
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-grey-mid" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-7 text-xs"
      />
    </div>
  );
}

/** Label, champion names, win-condition labels — everything a comp row shows. */
function compMatches(comp: DraftCompRow, query: string, data: PanelData): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (comp.label?.toLowerCase().includes(q)) return true;
  if (
    comp.win_conditions.some((slug) => (data.tagLabels.get(slug) ?? slug).toLowerCase().includes(q))
  ) {
    return true;
  }
  return comp.champion_ids.some((id) => data.championById.get(id)?.name.toLowerCase().includes(q));
}

// ------------------------------------------------------------
// Contextual mode
// ------------------------------------------------------------

type ContextualProps = {
  data: PanelData;
  /** Grid placement from the panel — `col-span-*`, nothing else. */
  className?: string;
  ourPicks: number[];
  theirPicks: number[];
  /** Series-aware — this game's board plus every pick carried from an earlier game. */
  unavailable: IdLookup;
  ourSide: Side;
};

export function SynergySection({ data, ourPicks, unavailable, className }: ContextualProps) {
  const complete = useMemo(() => assembledSynergies(data.comps, ourPicks), [data.comps, ourPicks]);
  const near = useMemo(
    () => nearSynergies(data.comps, ourPicks, unavailable),
    [data.comps, ourPicks, unavailable],
  );

  return (
    <Section
      title="Synergies"
      count={complete.length + near.length}
      href="/draft/synergies"
      linkLabel="Open saved synergies"
      className={className}
    >
      {complete.length === 0 && near.length === 0 ? (
        <EmptyNote href="/draft/synergies" cta="Save one">
          {ourPicks.length === 0
            ? "No picks on our side yet."
            : "No saved synergy matches these picks."}
        </EmptyNote>
      ) : (
        <>
          {complete.length > 0 && (
            <>
              <SubHead>Complete</SubHead>
              {complete.map((comp) => (
                <CompRow key={comp.id} comp={comp} data={data} />
              ))}
            </>
          )}

          {near.length > 0 && (
            <>
              <SubHead>One away</SubHead>
              {near.map(({ comp, missing }) => (
                <CompRow
                  key={comp.id}
                  comp={comp}
                  data={data}
                  emphasis={(id) => (id === missing ? "wanted" : "have")}
                  trailing={
                    <span className="ml-1 text-[10px] tracking-wide text-gold uppercase">
                      needs {data.championById.get(missing)?.name ?? `#${missing}`}
                    </span>
                  }
                />
              ))}
            </>
          )}
        </>
      )}
    </Section>
  );
}

export function CounterSection({
  data,
  ourPicks,
  theirPicks,
  unavailable,
  className,
}: ContextualProps) {
  // Takeable answers first — see availableFirst. Both lists get it: a threat
  // that's already banned is as dead as an answer that is.
  const answers = useMemo(
    () => availableFirst(countersAgainst(data.counterIndex, theirPicks), unavailable),
    [data.counterIndex, theirPicks, unavailable],
  );
  const threats = useMemo(
    () => availableFirst(countersFacing(data.counterIndex, ourPicks), unavailable),
    [data.counterIndex, ourPicks, unavailable],
  );
  const live = answers.filter((row) => !unavailable.has(row.counter_champion_id)).length;

  return (
    <Section
      title="Counters"
      // The count that matters is how many answers you can still take, not how
      // many rows exist — a section reading "9" over nine struck-through names
      // is worse than no number.
      count={live}
      href="/draft/counters"
      linkLabel="Open noted matchups"
      className={className}
    >
      <SubHead>Answers</SubHead>
      {answers.length === 0 ? (
        <EmptyNote href="/draft/counters" cta="Note some">
          {theirPicks.length === 0
            ? "Nothing on their side yet."
            : `No answers noted against ${nameList(theirPicks, data.championById)}.`}
        </EmptyNote>
      ) : (
        answers.map((row) => (
          <CounterRow
            key={row.id}
            row={row}
            data={data}
            gone={unavailable.has(row.counter_champion_id)}
          />
        ))
      )}

      <SubHead>Watch out</SubHead>
      {threats.length === 0 ? (
        <EmptyNote href="/draft/counters" cta="Note some">
          {ourPicks.length === 0
            ? "Nothing on our side yet."
            : `Nothing noted as beating ${nameList(ourPicks, data.championById)}.`}
        </EmptyNote>
      ) : (
        threats.map((row) => (
          <CounterRow
            key={row.id}
            row={row}
            data={data}
            gone={unavailable.has(row.counter_champion_id)}
          />
        ))
      )}
    </Section>
  );
}

export function CompSection({ data, ourPicks, className }: ContextualProps) {
  const matches = useMemo(() => matchingComps(data.comps, ourPicks), [data.comps, ourPicks]);

  return (
    <Section
      title="Compositions"
      count={matches.length}
      href="/draft/comps"
      linkLabel="Open saved compositions"
      className={className}
    >
      {matches.length === 0 ? (
        <EmptyNote href="/draft/comps" cta="Save one">
          {ourPicks.length === 0
            ? "Nothing on our side yet."
            : "No saved comp contains any of our picks."}
        </EmptyNote>
      ) : (
        matches.map(({ comp, matched, missing }) => (
          <CompRow
            key={comp.id}
            comp={comp}
            data={data}
            emphasis={(id) => (missing.includes(id) ? "need" : "have")}
            trailing={
              <span className="ml-1 text-[10px] tabular-nums text-grey-mid">
                {matched.length}/{comp.champion_ids.length}
              </span>
            }
          />
        ))
      )}
    </Section>
  );
}

/** One side's function-tag histogram. */
function TagHistogram({
  data,
  picks,
  tone,
  label,
}: {
  data: PanelData;
  picks: number[];
  tone: "cyan" | "loss";
  label: string;
}) {
  const counts = useMemo(
    () => sortedTagCounts(tagProfile(data.profiles, picks)),
    [data.profiles, picks],
  );
  const annotated = annotatedCount(data.profiles, picks);

  return (
    <>
      <SubHead>
        {label}
        {picks.length > 0 && (
          // The denominator, stated: a histogram over five picks of which two
          // are annotated is a different claim from one over five of five, and
          // the bars alone can't tell you which you're looking at.
          <span className="ml-1 normal-case">
            ({annotated} of {picks.length} annotated)
          </span>
        )}
      </SubHead>
      {counts.length === 0 ? (
        <p className="text-xs text-grey-mid">
          {picks.length === 0 ? "No picks yet." : "None of these picks carry a tag."}
        </p>
      ) : (
        counts.map(([slug, count]) => (
          <BarRow key={slug} fraction={count / picks.length} tone={tone}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-grey-light">{data.tagLabels.get(slug) ?? slug}</span>
              <span className="shrink-0 tabular-nums text-grey-mid">{count}</span>
            </div>
          </BarRow>
        ))
      )}
    </>
  );
}

export function TagSection({ data, ourPicks, theirPicks, ourSide, className }: ContextualProps) {
  // Toned by side rather than by ours/theirs, matching the board's own gradients
  // — blue is blue whichever team you're on.
  const ourTone = ourSide === "blue" ? "cyan" : "loss";

  return (
    <Section
      title="Champion tags"
      href="/draft/champions"
      linkLabel="Open champion annotations"
      className={className}
    >
      {/* Side by side once there's room. The whole point of this section is the
          comparison — "we have three Engage and they have none" — and two
          histograms stacked a scroll apart is the one layout that doesn't make
          it. A container query, not a breakpoint: this section spans the panel's
          full width in the docked layout and a phone's width in the sheet, and
          the viewport can't tell those apart. */}
      <div className="@md:grid-cols-2 grid gap-x-4 gap-y-1.5">
        <div className="flex flex-col gap-1.5">
          <TagHistogram data={data} picks={ourPicks} tone={ourTone} label="Ours" />
        </div>
        <div className="flex flex-col gap-1.5">
          <TagHistogram
            data={data}
            picks={theirPicks}
            tone={ourTone === "cyan" ? "loss" : "cyan"}
            label="Theirs"
          />
        </div>
      </div>
      {data.profiles.size === 0 && (
        <EmptyNote href="/draft/champions" cta="Tag some champions">
          Nothing is annotated yet.
        </EmptyNote>
      )}
    </Section>
  );
}

// ------------------------------------------------------------
// Explore mode
// ------------------------------------------------------------
//
// The same four tables, unfiltered and searchable — "what is Renekton tagged
// as", "do we have anything against K'Sante", "what was that poke comp called"
// — without leaving the draft.
//
// Nothing here slices or paginates. Every list sits in the panel's own scroll
// container, and the biggest of them is the counters table at some hundreds of
// rows, which is a third of what the champion grid already renders on this page.

export function ExploreSynergies({ data }: { data: PanelData }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => data.comps.filter((c) => c.kind === "synergy" && compMatches(c, query, data)),
    [data, query],
  );

  return (
    <Section
      title="Synergies"
      count={shown.length}
      href="/draft/synergies"
      linkLabel="Open saved synergies"
    >
      <SearchBox value={query} onChange={setQuery} placeholder="Champion, name or win condition" />
      {shown.length === 0 ? (
        <EmptyNote href="/draft/synergies" cta="Save one">
          {query ? "Nothing matches that." : "No synergies saved yet."}
        </EmptyNote>
      ) : (
        shown.map((comp) => <CompRow key={comp.id} comp={comp} data={data} />)
      )}
    </Section>
  );
}

export function ExploreComps({ data }: { data: PanelData }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => data.comps.filter((c) => c.kind === "comp" && compMatches(c, query, data)),
    [data, query],
  );

  return (
    <Section
      title="Compositions"
      count={shown.length}
      href="/draft/comps"
      linkLabel="Open saved compositions"
    >
      <SearchBox value={query} onChange={setQuery} placeholder="Champion, name or win condition" />
      {shown.length === 0 ? (
        <EmptyNote href="/draft/comps" cta="Save one">
          {query ? "Nothing matches that." : "No compositions saved yet."}
        </EmptyNote>
      ) : (
        shown.map((comp) => <CompRow key={comp.id} comp={comp} data={data} />)
      )}
    </Section>
  );
}

export function ExploreCounters({ data }: { data: PanelData }) {
  const [query, setQuery] = useState("");

  // Matches on *either* champion, so one query answers both readings: typing
  // "Nasus" finds what beats him and what he beats, which is what someone
  // staring at a Nasus on the board wants.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.counters;
    return data.counters.filter((row) => {
      const a = data.championById.get(row.counter_champion_id)?.name.toLowerCase() ?? "";
      const b = data.championById.get(row.target_champion_id)?.name.toLowerCase() ?? "";
      return a.includes(q) || b.includes(q) || (row.note?.toLowerCase().includes(q) ?? false);
    });
  }, [data, query]);

  return (
    <Section
      title="Counters"
      count={shown.length}
      href="/draft/counters"
      linkLabel="Open noted matchups"
    >
      <SearchBox value={query} onChange={setQuery} placeholder="Either champion, or a note" />
      {shown.length === 0 ? (
        <EmptyNote href="/draft/counters" cta="Note some">
          {query ? "Nothing matches that." : "No matchups noted yet."}
        </EmptyNote>
      ) : (
        shown.map((row) => (
          <CounterRow key={row.id} row={row} data={data} gone={false} lead="target" />
        ))
      )}
    </Section>
  );
}

export function ExploreChampions({ data }: { data: PanelData }) {
  const [query, setQuery] = useState("");

  // With a query, every champion that matches — so "is Renekton annotated?" is
  // answerable, and the answer can be "no". With no query, only the annotated
  // ones: an unfiltered list of 170 mostly-empty rows is a worse default than
  // the handful that have something to say.
  const shown = useMemo(() => {
    if (!query.trim()) {
      return data.champions.filter((c) => data.profiles.has(c.championId));
    }
    return suggest(data.champions, query);
  }, [data, query]);

  return (
    <Section
      title="Champions"
      count={shown.length}
      href="/draft/champions"
      linkLabel="Open champion annotations"
    >
      <SearchBox value={query} onChange={setQuery} placeholder="Champion" />
      {shown.length === 0 ? (
        <EmptyNote href="/draft/champions" cta="Annotate some">
          {query ? "No champion matches that." : "Nothing is annotated yet."}
        </EmptyNote>
      ) : (
        shown.map((champion) => {
          const profile = data.profiles.get(champion.championId);
          return (
            <div
              key={champion.championId}
              className="flex items-start gap-2 rounded-sm px-1.5 py-1"
            >
              <ChampionAvatar champion={champion} version={data.version} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5">
                  <span className="truncate text-xs text-grey-light">{champion.name}</span>
                  {profile && profile.roles.length > 0 && (
                    <span className="shrink-0 text-[10px] tracking-wide text-grey-mid uppercase">
                      {profile.roles.map((role) => formatRoleShort(role)).join(" / ")}
                    </span>
                  )}
                </p>
                {profile && profile.tags.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {profile.tags.map((slug) => (
                      <Badge key={slug} variant="outline" className="h-4 px-1.5 text-[10px]">
                        {data.tagLabels.get(slug) ?? slug}
                      </Badge>
                    ))}
                  </div>
                )}
                {profile?.notes && (
                  <p className="line-clamp-2 text-[11px] text-grey-mid">{profile.notes}</p>
                )}
                {!profile && <p className="text-[11px] text-grey-mid">Not annotated.</p>}
              </div>
            </div>
          );
        })
      )}
    </Section>
  );
}
