"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { updateOpponentBanPlan } from "@/app/(app)/team/actions";
import type { ChampionInfo } from "@/lib/ddragon";
import { BANS_PER_SIDE } from "@/lib/team/types";
import {
  describePickCount,
  type BanPlanPickCounts,
} from "@/components/team/views/opponent-scouting-view";
import { ChampionAvatar } from "@/components/champion-avatar";
import { ChampionCombobox } from "@/components/champion-combobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Champion = ChampionInfo & { championId: number };

/**
 * The ban plan editor — private only.
 *
 * The two ban lists already on this page are *history*: what they have taken
 * from us, what we have taken from them. Neither is what a coach writes down
 * before a series, which is a decision — these are coming off the board on
 * Saturday — and until this existed that decision lived in whatever chat the
 * team happened to use.
 *
 * Order is priority, so the list is ordered and reorderable rather than a set.
 * First in the array is first off the board, which matters when the opponent
 * bans one of your targets before you get there.
 */
export function BanPlanForm({
  opponentId,
  opponentName,
  initialPlan,
  pickCounts,
  champions,
  version,
}: {
  opponentId: string;
  opponentName: string;
  initialPlan: number[];
  /** How often this opponent picked each champion, from the page's own aggregate. */
  pickCounts: BanPlanPickCounts;
  champions: Champion[];
  version: string;
}) {
  const router = useRouter();
  const counts = new Map(pickCounts);
  const [plan, setPlan] = useState(initialPlan);
  const [saved, setSaved] = useState(initialPlan);
  const [saving, startSaving] = useTransition();
  // The combobox holds no effect syncing its text back from `selected`, so
  // clearing it after a pick means remounting it. See champion-combobox.tsx.
  const [pickerKey, setPickerKey] = useState(0);

  const championById = new Map(champions.map((c) => [c.championId, c]));
  const dirty = plan.length !== saved.length || plan.some((id, i) => id !== saved[i]);
  const full = plan.length >= BANS_PER_SIDE;

  function add(champion: Champion | null) {
    if (!champion || full || plan.includes(champion.championId)) return;
    setPickerKey((k) => k + 1);
    setPlan([...plan, champion.championId]);
  }

  function move(index: number, by: number) {
    const target = index + by;
    if (target < 0 || target >= plan.length) return;
    const next = [...plan];
    [next[index], next[target]] = [next[target], next[index]];
    setPlan(next);
  }

  function save() {
    const snapshot = plan;
    startSaving(async () => {
      const result = await updateOpponentBanPlan(opponentId, snapshot);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSaved(snapshot);
      toast.success(
        snapshot.length === 0 ? "Ban plan cleared." : `Ban plan saved for ${opponentName}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Ban plan</Label>
      <p className="-mt-1 text-xs text-grey-mid">
        Who we take off them, in the order we take it. Up to {BANS_PER_SIDE} — a plan longer
        than a side&apos;s bans is a wish list.
      </p>

      {plan.length > 0 && (
        <ol className="flex flex-col gap-1">
          {plan.map((id, index) => {
            const champion = championById.get(id);
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-sm border border-border bg-bg-tertiary/40 px-2 py-1.5"
              >
                <span className="w-4 shrink-0 text-center text-xs tabular-nums text-grey-mid">
                  {index + 1}
                </span>
                {champion ? (
                  <ChampionAvatar champion={champion} version={version} size="sm" banned />
                ) : (
                  <span className="h-6 w-6 shrink-0 rounded-sm bg-bg-tertiary" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-grey-light">
                    {/* An id DDragon no longer knows — a reworked or removed
                        champion — still renders and is still removable. A row
                        you can see but not delete is worse than an ugly one. */}
                    {champion?.name ?? `Champion #${id}`}
                  </p>
                  {/* The justification, next to the decision. A target they have
                      never picked is not necessarily wrong, but it is worth
                      seeing before the series rather than after. */}
                  <p className="text-[10px] text-grey-mid">
                    {describePickCount(counts.get(id) ?? 0)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${champion?.name ?? id} up`}
                    className="h-6 w-6 p-0 text-xs"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => move(index, 1)}
                    disabled={index === plan.length - 1}
                    aria-label={`Move ${champion?.name ?? id} down`}
                    className="h-6 w-6 p-0 text-xs"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPlan(plan.filter((x) => x !== id))}
                    aria-label={`Remove ${champion?.name ?? id}`}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {full ? (
        <p className="text-xs text-grey-mid">
          Five is a full ban phase. Remove one to add another.
        </p>
      ) : (
        <ChampionCombobox
          key={pickerKey}
          label="Add to the ban plan"
          champions={champions}
          version={version}
          selected={null}
          onSelect={add}
          isDisabled={(champion) => plan.includes(champion.championId)}
          className="max-w-xs"
        />
      )}

      <Button
        type="button"
        size="sm"
        onClick={save}
        disabled={!dirty || saving}
        className="self-start"
      >
        {saving ? <Loader2 className="animate-spin" /> : <Save />}
        {saving ? "Saving…" : "Save ban plan"}
      </Button>
    </div>
  );
}
