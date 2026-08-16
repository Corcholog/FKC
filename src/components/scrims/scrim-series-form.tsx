"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { saveScrimSeries, updateScrimSeries } from "@/app/(app)/scrims/actions";
import {
  SCRIM_KINDS,
  SCRIM_KIND_LABELS,
  MAX_GAMES_PER_SERIES,
  type ScrimKind,
  type ScrimRole,
} from "@/lib/scrims/types";
import { patchFromVersion } from "@/lib/ddragon";
import type { ScrimOpponentRow } from "@/lib/scrims/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ScrimGameFields,
  type PickableChampion,
  type RosterOption,
} from "@/components/scrims/scrim-game-fields";
import {
  buildSeriesPayload,
  emptyGame,
  formSignature,
  otherSide,
  usedEarlierInSeries,
  type GameState,
  type SeriesFormState,
} from "@/components/scrims/draft-form-state";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { cn } from "@/lib/utils";

const NEW_OPPONENT = "__new__";

/**
 * The series this form is editing, loaded into the shape the form works in.
 *
 * One component for both jobs rather than two: entering a series and correcting
 * one are the same twenty fields, and a second copy of the draft grid would
 * drift from this one the first time either changed.
 */
export type EditingSeries = {
  id: string;
  opponentId: string;
  playedOn: string;
  kind: ScrimKind;
  fearless: boolean;
  notes: string;
  games: GameState[];
};

export function ScrimSeriesForm({
  opponents,
  roster,
  defaultLineup,
  champions,
  version,
  editing,
}: {
  opponents: ScrimOpponentRow[];
  roster: RosterOption[];
  /** Who normally plays each role — seeded from the last series, else main role. */
  defaultLineup: Record<ScrimRole, string | null>;
  champions: PickableChampion[];
  version: string;
  /** Set to rewrite an existing series; omitted to enter a new one. */
  editing?: EditingSeries;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();

  // The patch every new game starts on. Derived from the DDragon version this
  // page already loads for the champion pickers, so it costs nothing and is
  // right whenever a series is entered the same week it was played — which is
  // almost always. Wrong occasionally and editable in place, which beats
  // blank-by-default: that is what left every recorded game with no patch.
  const currentPatch = patchFromVersion(version);

  // The form as it was handed over: the saved series when editing, an empty
  // one otherwise. Held as state with a lazy initialiser so it's built once —
  // emptyGame() mints a new key each call, and re-running it every render would
  // remount the champion fields mid-typing.
  const [initial] = useState<SeriesFormState>(() => ({
    opponentId: editing?.opponentId ?? opponents[0]?.id ?? null,
    opponentName: "",
    playedOn: editing?.playedOn ?? todayInputValue(),
    kind: editing?.kind ?? "scrim",
    fearless: editing?.fearless ?? false,
    notes: editing?.notes ?? "",
    games: editing?.games ?? [emptyGame("blue", defaultLineup, currentPatch)],
  }));

  const [opponentId, setOpponentId] = useState<string | null>(initial.opponentId);
  const [opponentName, setOpponentName] = useState(initial.opponentName);
  const [playedOn, setPlayedOn] = useState(initial.playedOn);
  const [kind, setKind] = useState<ScrimKind>(initial.kind);
  const [fearless, setFearless] = useState(initial.fearless);
  const [notes, setNotes] = useState(initial.notes);
  const [games, setGames] = useState<GameState[]>(initial.games);

  const current: SeriesFormState = {
    opponentId,
    opponentName,
    playedOn,
    kind,
    fearless,
    notes,
    games,
  };

  // Twenty champion selections and forty numbers, none of it autosaved. The
  // comparison is against what's stored — where the form started, and then
  // whatever the last successful save wrote — so undoing an edit by hand clears
  // the warning instead of leaving it stuck on, and a save clears it without
  // the fields having to change.
  const [baseline, setBaseline] = useState(() => formSignature(initial));
  const unsaved = formSignature(current) !== baseline;

  const championsById = useMemo(
    () => new Map(champions.map((c) => [c.championId, c])),
    [champions],
  );

  function patchGame(index: number, patch: Partial<GameState>) {
    setGames((prev) => prev.map((game, i) => (i === index ? { ...game, ...patch } : game)));
  }

  function addGame() {
    setGames((prev) => {
      if (prev.length >= MAX_GAMES_PER_SERIES) return prev;
      // Sides alternate between games of a series, so defaulting to the
      // opposite of the last one is right far more often than not.
      const last = prev[prev.length - 1];
      return [
        ...prev,
        // Inherits the previous game's patch rather than today's: every game of
        // a series was played in one sitting, so game 2 is on whatever game 1
        // said — including when that was corrected by hand.
        emptyGame(
          last ? otherSide(last.side) : "blue",
          defaultLineup,
          last?.patch ?? currentPatch,
        ),
      ];
    });
  }

  function removeGame(index: number) {
    // Dropping a saved game takes its note thread with it — scrim_game_notes
    // cascades off the game row. Said out loud here rather than in a dialog:
    // nothing is gone until the series is saved, so a warning that blocks the
    // click would be asking to confirm something that hasn't happened yet.
    if (games[index]?.id) {
      toast.warning("Game removed. Saving deletes it, and any notes written on it.");
    }
    setGames((prev) => prev.filter((_, i) => i !== index));
  }

  function save() {
    const built = buildSeriesPayload(current);
    if (!built.ok) {
      toast.error(built.error);
      return;
    }

    // Taken before the round trip, so a field typed while it's in flight stays
    // counted as unsaved rather than being marked stored by a save that didn't
    // include it.
    const snapshot = formSignature(current);

    startSaving(async () => {
      const result = editing
        ? await updateScrimSeries(editing.id, built.payload)
        : await saveScrimSeries(built.payload);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        editing ? "Series updated." : `Saved ${games.length} game${games.length === 1 ? "" : "s"}.`,
      );
      // What's on screen is now what's stored, which disarms the guard for the
      // navigation below — without it, clicking anything while the destination
      // renders would ask about saving work that's already saved.
      setBaseline(snapshot);
      router.push(result.seriesId ? `/scrims/${result.seriesId}` : "/scrims/history");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="panel-hex flex flex-col gap-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scrim-opponent">Opponent</Label>
            <Select
              value={opponentId ?? NEW_OPPONENT}
              onValueChange={(value) => setOpponentId(value === NEW_OPPONENT ? null : (value as string))}
            >
              <SelectTrigger id="scrim-opponent" className="w-full">
                <SelectValue>
                  {(value: string) =>
                    value === NEW_OPPONENT
                      ? "New team…"
                      : opponents.find((o) => o.id === value)?.name ?? "New team…"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {opponents.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_OPPONENT}>New team…</SelectItem>
              </SelectContent>
            </Select>
            {/* Only when creating one. A name that matches an existing team
                case-insensitively resolves to it rather than making a second. */}
            {opponentId === null && (
              <Input
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
                placeholder="University name"
                aria-label="New opponent name"
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scrim-date">Date</Label>
            <Input
              id="scrim-date"
              type="date"
              value={playedOn}
              onChange={(e) => setPlayedOn(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scrim-kind">Type</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as ScrimKind)}>
              <SelectTrigger id="scrim-kind" className="w-full">
                <SelectValue>{(value: ScrimKind) => SCRIM_KIND_LABELS[value]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SCRIM_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {SCRIM_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scrim-fearless">Fearless</Label>
            <label
              htmlFor="scrim-fearless"
              className="flex h-9 items-center gap-2 text-sm text-grey-light"
            >
              <input
                id="scrim-fearless"
                type="checkbox"
                checked={fearless}
                onChange={(e) => setFearless(e.target.checked)}
                className="size-4 accent-gold"
              />
              Champions can&apos;t repeat
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scrim-notes">Series notes</Label>
          <Textarea
            id="scrim-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How the block went, what to fix, anything worth remembering."
            rows={2}
          />
        </div>
      </div>

      {games.map((game, index) => (
        // Keyed on the game's own id, not the index: removing game 2 of 3 would
        // otherwise shift game 3 into its slot and leave the champion fields
        // showing the deleted game's text.
        <ScrimGameFields
          key={game.key}
          game={game}
          index={index}
          roster={roster}
          champions={champions}
          championsById={championsById}
          version={version}
          fearlessUsed={fearless ? usedEarlierInSeries(games, index) : EMPTY_SET}
          canRemove={games.length > 1}
          // A saved game's notes are an authored thread on the series page, so
          // the entry-time note box would be a field that writes nothing here.
          showNotes={!editing}
          onChange={(patch) => patchGame(index, patch)}
          onRemove={() => removeGame(index)}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addGame}
          disabled={games.length >= MAX_GAMES_PER_SERIES}
        >
          <Plus />
          Add game
        </Button>
        {/* Same warning the tier list editor carries, for the same reason:
            nothing here autosaves, and this form is twenty champion selections
            deep before it's worth anything. */}
        {unsaved && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">
            <span className="size-1.5 rounded-full bg-warning" />
            Unsaved changes
          </span>
        )}
        {editing && (
          <Link
            href={`/scrims/${editing.id}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), !unsaved && "ml-auto")}
          >
            Cancel
          </Link>
        )}
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={saving}
          className={cn(!editing && !unsaved && "ml-auto")}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "Saving…" : editing ? "Save changes" : "Save series"}
        </Button>
      </div>

      {/* A scrim goes in from a screenshot after the block, usually late, in one
          sitting. Clicking anything in the navbar mid-entry used to drop the
          lot without a word — a client-side navigation never fires
          beforeunload. */}
      <UnsavedChangesGuard
        when={unsaved}
        title={editing ? "Leave without saving your changes?" : "Leave without saving this series?"}
        description={
          editing
            ? "The corrections you've made to this series aren't stored yet, and leaving drops them."
            : "This series hasn't been saved yet. Leaving now loses every game you've entered."
        }
      />
    </div>
  );
}

/** Shared empty set so a non-fearless series doesn't allocate one per game per render. */
const EMPTY_SET: Set<number> = new Set();

/**
 * Today as yyyy-mm-dd in the *browser's* timezone.
 *
 * `toISOString()` would be UTC, which for Argentina (UTC-3) means every scrim
 * entered before 9pm defaults to yesterday.
 */
function todayInputValue(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
