"use client";

import { Trash2 } from "lucide-react";
import { formatRole } from "@/lib/roles";
import { BANS_PER_SIDE, SCRIM_ROLES, type ScrimRole } from "@/lib/scrims/types";
import type { ChampionInfo } from "@/lib/ddragon";
import { ChampionCombobox } from "@/components/champion-combobox";
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
import { cn } from "@/lib/utils";
import { otherSide, usedInGame, type GameState, type PickState } from "./draft-form-state";

export type PickableChampion = ChampionInfo & { championId: number };

export type RosterOption = { id: string; display_name: string };

/** The value the "not on the roster" option carries — "" is the empty select. */
const OTHER_PLAYER = "__other__";

function StatInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      // inputMode rather than type="number": the spinners are useless at this
      // size and a number input silently accepts "e" and "-".
      inputMode="numeric"
      aria-label={label}
      placeholder={label}
      className="h-8 w-11 px-1 text-center text-sm"
    />
  );
}

function BanRow({
  label,
  bans,
  champions,
  championsById,
  version,
  unavailable,
  onChange,
}: {
  label: string;
  bans: Array<number | null>;
  champions: PickableChampion[];
  championsById: Map<number, PickableChampion>;
  version: string;
  unavailable: Set<number>;
  onChange: (index: number, championId: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-xs tracking-wide text-grey-mid uppercase">{label}</span>
      {Array.from({ length: BANS_PER_SIDE }).map((_, i) => {
        const current = bans[i] ?? null;
        return (
          <ChampionCombobox
            key={i}
            label={`Ban ${i + 1}`}
            champions={champions}
            version={version}
            selected={current === null ? null : championsById.get(current) ?? null}
            onSelect={(c) => onChange(i, c?.championId ?? null)}
            isDisabled={(c) => c.championId !== current && unavailable.has(c.championId)}
            className="w-24"
          />
        );
      })}
    </div>
  );
}

function DraftRow({
  role,
  pick,
  ally,
  roster,
  champions,
  championsById,
  version,
  unavailable,
  onChange,
}: {
  role: ScrimRole;
  pick: PickState;
  ally: boolean;
  roster: RosterOption[];
  champions: PickableChampion[];
  championsById: Map<number, PickableChampion>;
  version: string;
  unavailable: Set<number>;
  onChange: (patch: Partial<PickState>) => void;
}) {
  // An ally row is a roster dropdown that can fall back to a free-text name; an
  // enemy row is only ever free text, since we don't track their accounts.
  const showNameField = !ally || pick.playerId === null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-12 shrink-0 text-xs font-medium tracking-wide text-grey-light uppercase">
        {formatRole(role)}
      </span>

      {ally && (
        <Select
          value={pick.playerId ?? OTHER_PLAYER}
          onValueChange={(value) =>
            onChange({ playerId: value === OTHER_PLAYER ? null : (value as string) })
          }
        >
          <SelectTrigger aria-label={`${formatRole(role)} player`} className="h-8 w-28 text-sm">
            <SelectValue>
              {(value: string) =>
                value === OTHER_PLAYER
                  ? "Someone else"
                  : roster.find((p) => p.id === value)?.display_name ?? "Someone else"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {roster.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.display_name}
              </SelectItem>
            ))}
            <SelectItem value={OTHER_PLAYER}>Someone else…</SelectItem>
          </SelectContent>
        </Select>
      )}

      {showNameField && (
        <Input
          value={pick.playerName}
          onChange={(e) => onChange({ playerName: e.target.value })}
          placeholder={ally ? "Sub name" : "Nickname"}
          aria-label={ally ? `${formatRole(role)} substitute name` : `Enemy ${formatRole(role)} nickname`}
          className="h-8 w-28 text-sm"
        />
      )}

      <ChampionCombobox
        label="Champion"
        champions={champions}
        version={version}
        selected={pick.championId === null ? null : championsById.get(pick.championId) ?? null}
        onSelect={(c) => onChange({ championId: c?.championId ?? null })}
        isDisabled={(c) => c.championId !== pick.championId && unavailable.has(c.championId)}
        className="w-32"
      />

      <div className="flex items-center gap-1">
        <StatInput label="K" value={pick.kills} onChange={(v) => onChange({ kills: v })} />
        <StatInput label="D" value={pick.deaths} onChange={(v) => onChange({ deaths: v })} />
        <StatInput label="A" value={pick.assists} onChange={(v) => onChange({ assists: v })} />
        <StatInput label="CS" value={pick.totalCs} onChange={(v) => onChange({ totalCs: v })} />
      </div>
    </div>
  );
}

export function ScrimGameFields({
  game,
  index,
  roster,
  champions,
  championsById,
  version,
  fearlessUsed,
  canRemove,
  showNotes = true,
  onChange,
  onRemove,
}: {
  game: GameState;
  index: number;
  roster: RosterOption[];
  champions: PickableChampion[];
  championsById: Map<number, PickableChampion>;
  version: string;
  /** Champions used earlier in this series, when the series is fearless. */
  fearlessUsed: Set<number>;
  canRemove: boolean;
  /**
   * Off when editing a saved series: by then the game's notes are a thread on
   * the series page, written by whoever wrote them, and this box would be a
   * second place to type something that goes nowhere.
   */
  showNotes?: boolean;
  onChange: (patch: Partial<GameState>) => void;
  onRemove: () => void;
}) {
  // Anything already in this game's draft, plus anything a fearless series
  // burned in an earlier game. Each field re-allows its own current pick, so
  // re-opening a filled combobox doesn't show its own champion as taken.
  const unavailable = new Set([...usedInGame(game), ...fearlessUsed]);

  const patchPick = (ally: boolean, role: ScrimRole, patch: Partial<PickState>) => {
    const key = ally ? "ally" : "enemy";
    onChange({ [key]: { ...game[key], [role]: { ...game[key][role], ...patch } } });
  };

  const patchBans = (ally: boolean, i: number, championId: number | null) => {
    const key = ally ? "allyBans" : "enemyBans";
    const next = [...game[key]];
    next[i] = championId;
    onChange({ [key]: next });
  };

  const ourLabel = game.side === "blue" ? "Blue" : "Red";
  const theirLabel = otherSide(game.side) === "blue" ? "Blue" : "Red";

  return (
    <div className="panel-hex flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-heading text-base font-semibold text-white">Game {index + 1}</h3>

        {/* Side and result as two-state toggles rather than selects: they're the
            two fields entered on every single game, and a click beats a click
            plus a menu. */}
        <div className="flex overflow-hidden rounded-md border border-border">
          {(["blue", "red"] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => onChange({ side })}
              className={cn(
                "px-3 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors",
                game.side === side
                  ? side === "blue"
                    ? "bg-cyan/20 text-cyan"
                    : "bg-loss/20 text-loss"
                  : "text-grey-mid hover:text-white",
              )}
            >
              {side}
            </button>
          ))}
        </div>

        <div className="flex overflow-hidden rounded-md border border-border">
          {[
            { win: true, label: "Win" },
            { win: false, label: "Loss" },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onChange({ win: option.win })}
              className={cn(
                "px-3 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors",
                game.win === option.win
                  ? option.win
                    ? "bg-win/20 text-win"
                    : "bg-loss/20 text-loss"
                  : "text-grey-mid hover:text-white",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Input
          value={game.duration}
          onChange={(e) => onChange({ duration: e.target.value })}
          placeholder="32:14"
          aria-label={`Game ${index + 1} duration`}
          className="h-8 w-20 text-sm"
        />

        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={`Remove game ${index + 1}`}
            className="ml-auto"
          >
            <Trash2 />
          </Button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-gold uppercase">
            Us — {ourLabel} side
          </p>
          <BanRow
            label="Our bans"
            bans={game.allyBans}
            champions={champions}
            championsById={championsById}
            version={version}
            unavailable={unavailable}
            onChange={(i, id) => patchBans(true, i, id)}
          />
          {SCRIM_ROLES.map((role) => (
            <DraftRow
              key={role}
              role={role}
              pick={game.ally[role]}
              ally
              roster={roster}
              champions={champions}
              championsById={championsById}
              version={version}
              unavailable={unavailable}
              onChange={(patch) => patchPick(true, role, patch)}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-grey-light uppercase">
            Them — {theirLabel} side
          </p>
          <BanRow
            label="Their bans"
            bans={game.enemyBans}
            champions={champions}
            championsById={championsById}
            version={version}
            unavailable={unavailable}
            onChange={(i, id) => patchBans(false, i, id)}
          />
          {SCRIM_ROLES.map((role) => (
            <DraftRow
              key={role}
              role={role}
              pick={game.enemy[role]}
              ally={false}
              roster={roster}
              champions={champions}
              championsById={championsById}
              version={version}
              unavailable={unavailable}
              onChange={(patch) => patchPick(false, role, patch)}
            />
          ))}
        </div>
      </div>

      {/* Optional, and last on purpose — the draft is why anyone opens this
          form. What's typed here becomes the first note in the game's thread,
          so it can be edited, replied to and deleted afterwards like any
          other. */}
      {showNotes && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${game.key}-notes`} className="text-xs">
            Game notes
          </Label>
          <Textarea
            id={`${game.key}-notes`}
            value={game.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Optional — how it went, what to review."
            rows={2}
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}
