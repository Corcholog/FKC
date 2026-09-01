"use client";

import { useActionState, useRef, useState } from "react";
import { Star, StarOff } from "lucide-react";
import { addAccount, removeAccount, setAccountQueues, setPrimaryAccount } from "@/app/(app)/settings/actions/accounts";
import { emptyPlayerFormState, type PlayerFormState } from "@/app/(app)/settings/form-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLATFORMS, platformLabel } from "@/lib/platforms";

export type PlayerAccount = {
  puuid: string;
  player_id: string;
  riot_game_name: string;
  riot_tag_line: string;
  platform: string;
  is_primary: boolean;
  track_solo: boolean;
  track_flex: boolean;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  flex_tier: string | null;
};

export function PlatformSelect({
  name = "platform",
  defaultValue = "LA2",
}: {
  name?: string;
  defaultValue?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="h-9 rounded-md border border-border bg-bg-secondary px-2 text-sm text-white"
    >
      {PLATFORMS.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Which queues an account is walked for, as two checkboxes that save on change.
 *
 * They are not cosmetic: an id-page call per account per queue per run is real
 * money against a key that allows 100 requests every two minutes, so an account
 * nobody flexes on should not be asked about flex every morning.
 */
function QueueToggles({ account }: { account: PlayerAccount }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(setAccountQueues, emptyPlayerFormState);

  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="puuid" value={account.puuid} />
      <label className="flex items-center gap-1.5 text-xs text-grey-light">
        <input
          type="checkbox"
          name="trackSolo"
          defaultChecked={account.track_solo}
          disabled={pending}
          onChange={() => formRef.current?.requestSubmit()}
        />
        SoloQ
      </label>
      <label className="flex items-center gap-1.5 text-xs text-grey-light">
        <input
          type="checkbox"
          name="trackFlex"
          defaultChecked={account.track_flex}
          disabled={pending}
          onChange={() => formRef.current?.requestSubmit()}
        />
        FlexQ
      </label>
      {state?.error && <span className="text-xs text-loss">{state.error}</span>}
    </form>
  );
}

function AccountRow({ account, canDemote }: { account: PlayerAccount; canDemote: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const rank = account.tier
    ? `${account.tier}${account.division ? ` ${account.division}` : ""}${
        account.league_points === null ? "" : ` · ${account.league_points} LP`
      }`
    : "Unranked";

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border border-border/60 bg-bg-secondary/40 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {account.is_primary ? (
          <Star className="h-3.5 w-3.5 shrink-0 text-gold" aria-label="Primary account" />
        ) : (
          <StarOff className="h-3.5 w-3.5 shrink-0 text-grey-mid" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm text-white">
            {account.riot_game_name}
            <span className="text-grey-mid">#{account.riot_tag_line}</span>
          </p>
          <p className="truncate text-xs text-grey-mid">
            {rank}
            {account.flex_tier ? ` · flex ${account.flex_tier}` : ""}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {platformLabel(account.platform)}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <QueueToggles account={account} />

        {!account.is_primary && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => run(() => setPrimaryAccount(account.puuid))}
            title="Show this account's Riot ID and rank as the player's"
          >
            Make primary
          </Button>
        )}

        {/* The primary account can only go when it is the last one — the
            player's displayed Riot ID and rank are mirrored from it. */}
        {(!account.is_primary || canDemote) && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-loss hover:text-danger"
            disabled={busy}
            onClick={() => run(() => removeAccount(account.puuid))}
          >
            Remove
          </Button>
        )}
      </div>

      {error && <p className="w-full text-xs text-loss">{error}</p>}
    </li>
  );
}

function AddAccountForm({ playerId }: { playerId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prevState: PlayerFormState, formData: FormData) => {
      const result = await addAccount(prevState, formData);
      if (result.success) {
        formRef.current?.reset();
        setOpen(false);
      }
      return result;
    },
    emptyPlayerFormState,
  );

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="xs" onClick={() => setOpen(true)}>
          Add account
        </Button>
        {state?.message && <span className="text-xs text-win">{state.message}</span>}
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="playerId" value={playerId} />

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-grey-light">Game name</Label>
        <Input name="gameName" required className="h-9" />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-grey-light">Tag line</Label>
        <Input name="tagLine" required className="h-9 w-24" />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-grey-light">Server</Label>
        <PlatformSelect />
      </div>

      {/* Defaults match what each queue is usually for: a second account is
          normally a soloQ smurf, and flex is opt-in per account because the
          team plays it on specific ones. */}
      <div className="flex items-center gap-3 pb-2">
        <label className="flex items-center gap-1.5 text-xs text-grey-light">
          <input type="checkbox" name="trackSolo" defaultChecked />
          SoloQ
        </label>
        <label className="flex items-center gap-1.5 text-xs text-grey-light">
          <input type="checkbox" name="trackFlex" />
          FlexQ
        </label>
      </div>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>

      {state?.error && <p className="w-full text-sm text-loss">{state.error}</p>}
      <p className="w-full text-xs text-grey-mid">
        Adding an account walks its history straight away, so this can take a few seconds.
      </p>
    </form>
  );
}

/**
 * Every Riot account one person owns.
 *
 * The list is the whole feature: before player_accounts a roster slot *was* a
 * Riot account, so a smurf, an account on another server, or the account the
 * team plays flex on could only be tracked by pretending it was a different
 * person — which split their history in two.
 */
export function PlayerAccounts({
  playerId,
  accounts,
}: {
  playerId: string;
  accounts: PlayerAccount[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {accounts.map((account) => (
          <AccountRow key={account.puuid} account={account} canDemote={accounts.length === 1} />
        ))}
      </ul>
      <AddAccountForm playerId={playerId} />
    </div>
  );
}
