"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import type { ChampionInfo } from "@/lib/ddragon";
import { formatRoleShort } from "@/lib/roles";
import { indexCounters } from "@/lib/draft/queries";
import { DRAFT_ROLES, type ChampionCounterRow, type ChampionProfileRow } from "@/lib/draft/types";
import { ChampionAvatar } from "@/components/champion-avatar";
import { ChampionCombobox } from "@/components/champion-combobox";
import { ChampionCounters } from "@/components/draft/champion-counters";
import { CounterGroupEditor } from "@/components/draft/counter-group-editor";
import { CounterList } from "@/components/draft/counter-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };
const ALL_ROLES = "__all__";

/**
 * The counters page: a card per champion the team has noted answers to, plus a
 * search that focuses one champion.
 *
 * This replaced a matrix, and the reason was usage rather than size. Counter
 * data is touched at exactly three moments — writing it down during prep,
 * looking one champion up during prep, and having it surfaced by the board
 * during a live draft (that last one is the contextual panel, not this page).
 * None of those is "scan the whole relation space", which is the only thing a
 * grid is good at. A grid also puts every champion on both axes, so it stays
 * ~97% empty however sparse the data is, and it renders each relation as a dot
 * whose note — the reason the row was written at all — is invisible until you
 * hover that single cell. Cards show the note.
 *
 * The search is a ChampionCombobox rather than a filter over the cards on
 * purpose: a filter can only find champions that already have answers noted,
 * and "how do we answer Jarvan" is most worth asking when the answer is
 * *nothing yet*. Picking a champion with no rows lands on an empty focused view
 * with an Add button, which is exactly the right place to be.
 */
export function CounterBrowser({
  champions,
  version,
  counters,
  profiles,
  readOnly = false,
}: {
  champions: Champion[];
  version: string;
  counters: ChampionCounterRow[];
  profiles: ChampionProfileRow[];
  /** Drops every "Add answers" entry point and the editor. See ChampionProfileTable. */
  readOnly?: boolean;
}) {
  const [focused, setFocused] = useState<Champion | null>(null);
  // The combobox deliberately has no effect syncing its text back from
  // `selected` (see champion-combobox.tsx) — clearing it means remounting it.
  const [searchKey, setSearchKey] = useState(0);
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);
  // Every card and the toolbar button open the same editor: the full list of
  // answers to one champion. An unset championId is the toolbar's blank entry
  // point, where the dialog asks which champion first.
  const [editorTarget, setEditorTarget] = useState<{ championId?: number } | null>(null);

  const championById = useMemo(() => new Map(champions.map((c) => [c.championId, c])), [champions]);
  const rolesByChampion = useMemo(
    () => new Map(profiles.map((p) => [p.champion_id, p.roles])),
    [profiles],
  );

  const cards = useMemo(() => {
    const { counteredBy } = indexCounters(counters);
    return [...counteredBy.entries()]
      .flatMap(([championId, rows]) => {
        const champion = championById.get(championId);
        return champion ? [{ champion, rows }] : [];
      })
      .filter(({ champion }) =>
        // Roles come from champion_profiles, so a champion nobody has annotated
        // has none and drops out of every role filter. That's the same trade
        // the champions table makes: the filter is over what the team wrote
        // down, not over what Riot says.
        roleFilter === ALL_ROLES
          ? true
          : rolesByChampion.get(champion.championId)?.includes(roleFilter),
      )
      .sort((a, b) => a.champion.name.localeCompare(b.champion.name));
  }, [counters, championById, roleFilter, rolesByChampion]);

  const nothingNoted = counters.length === 0;

  function clearFocus() {
    setFocused(null);
    setSearchKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ChampionCombobox
            key={searchKey}
            label="How do we answer…?"
            champions={champions}
            version={version}
            selected={focused}
            onSelect={setFocused}
            className="w-56"
          />
          {focused && (
            <Button type="button" size="sm" variant="outline" onClick={clearFocus}>
              <X className="size-3" />
              Clear
            </Button>
          )}
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
        </div>
        {!readOnly && (
          <Button type="button" size="sm" onClick={() => setEditorTarget({})}>
            <Plus /> Add answers
          </Button>
        )}
      </div>

      {focused && (
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">
            {focused.name}
          </h2>
          <ChampionCounters
            champion={focused}
            champions={champions}
            version={version}
            allCounters={counters}
            className="panel-hex rounded-lg border-t-0 bg-transparent p-4"
            readOnly={readOnly}
          />
        </div>
      )}

      {/* Never an early return — the editor mount point at the bottom has to
          render in every state, or "Add answers" from the empty page sets
          editorTarget and nothing happens, because the next render hits the
          same branch again and never reaches the dialog. */}
      {nothingNoted ? (
        <div className="panel-hex flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-grey-light">No matchups noted yet.</p>
          <p className="max-w-md text-xs text-grey-mid">
            Search a champion above to write down what beats them, or add answers from a
            champion&apos;s row on the Champions tab.
          </p>
          {!readOnly && (
            <Button type="button" size="sm" className="mt-1" onClick={() => setEditorTarget({})}>
              <Plus /> Add answers
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-grey-mid">
            One card per champion you might face, and what the team has noted as good picks
            into them.
            {!readOnly && " Click a card to edit the whole list."}
          </p>
          {cards.length === 0 ? (
            <p className="panel-hex p-6 text-center text-sm text-grey-mid">
              No champion matches that filter.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map(({ champion, rows }) => (
                <div key={champion.championId} className="panel-hex flex flex-col p-3">
                  {/* The champion being answered has to read as a different
                      kind of thing from the answers under it, or the card is
                      just a list of champions where the first one happens to
                      be the enemy. Three cues, none of them subtle on their
                      own: a larger portrait, a white name against the list's
                      grey, and the rule below. */}
                  {(() => {
                    const heading = (
                      <>
                        <ChampionAvatar champion={champion} version={version} size="md" />
                        <span className="truncate font-medium text-white">{champion.name}</span>
                        <span className="ml-auto shrink-0 text-[10px] tracking-wide text-grey-mid uppercase">
                          {rows.length} {rows.length === 1 ? "answer" : "answers"}
                        </span>
                      </>
                    );
                    return readOnly ? (
                      <div className="-mx-1 flex items-center gap-2 rounded-sm px-1 py-1">
                        {heading}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditorTarget({ championId: champion.championId })}
                        aria-haspopup="dialog"
                        aria-label={`Edit answers to ${champion.name}`}
                        className="-mx-1 flex items-center gap-2 rounded-sm px-1 py-1 text-left hover:bg-bg-tertiary/40"
                      >
                        {heading}
                      </button>
                    );
                  })()}
                  <div aria-hidden className="my-2 h-px bg-border" />
                  <CounterList
                    rows={rows}
                    championById={championById}
                    version={version}
                    otherSideOf={(row) => row.counter_champion_id}
                    onOpen={
                      readOnly ? undefined : () => setEditorTarget({ championId: champion.championId })
                    }
                    emptyLabel="Nothing noted."
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!readOnly && editorTarget && (
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
