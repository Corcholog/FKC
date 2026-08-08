"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { saveScrimSeries } from "@/app/(app)/scrims/actions";
import {
  SCRIM_KINDS,
  SCRIM_KIND_LABELS,
  MAX_GAMES_PER_SERIES,
  type ScrimKind,
  type ScrimRole,
} from "@/lib/scrims/types";
import type { ScrimOpponentRow } from "@/lib/scrims/types";
import { Button } from "@/components/ui/button";
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
  otherSide,
  usedEarlierInSeries,
  type GameState,
} from "@/components/scrims/draft-form-state";

const NEW_OPPONENT = "__new__";

export function ScrimSeriesForm({
  opponents,
  roster,
  defaultLineup,
  champions,
  version,
}: {
  opponents: ScrimOpponentRow[];
  roster: RosterOption[];
  /** Who normally plays each role — seeded from the last series, else main role. */
  defaultLineup: Record<ScrimRole, string | null>;
  champions: PickableChampion[];
  version: string;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();

  const [opponentId, setOpponentId] = useState<string | null>(opponents[0]?.id ?? null);
  const [opponentName, setOpponentName] = useState("");
  const [playedOn, setPlayedOn] = useState(() => todayInputValue());
  const [kind, setKind] = useState<ScrimKind>("scrim");
  const [fearless, setFearless] = useState(false);
  const [notes, setNotes] = useState("");
  const [games, setGames] = useState<GameState[]>(() => [emptyGame("blue", defaultLineup)]);

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
      return [...prev, emptyGame(last ? otherSide(last.side) : "blue", defaultLineup)];
    });
  }

  function removeGame(index: number) {
    setGames((prev) => prev.filter((_, i) => i !== index));
  }

  function save() {
    const built = buildSeriesPayload(
      { opponentId, opponentName, playedOn, kind, fearless, notes },
      games,
    );
    if (!built.ok) {
      toast.error(built.error);
      return;
    }

    startSaving(async () => {
      const result = await saveScrimSeries(built.payload);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Saved ${games.length} game${games.length === 1 ? "" : "s"}.`);
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
        <Button type="button" size="sm" onClick={save} disabled={saving} className="ml-auto">
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "Saving…" : `Save series`}
        </Button>
      </div>
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
