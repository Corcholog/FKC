"use client";

import { useActionState, useRef } from "react";
import { addPlayer } from "@/app/(app)/settings/actions/roster";
import { emptyPlayerFormState, type PlayerFormState } from "@/app/(app)/settings/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformSelect } from "@/components/settings/player-accounts";
import { formatRole } from "@/lib/roles";
import { TEAM_ROLES } from "@/lib/team/types";

export function AddPlayerForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prevState: PlayerFormState, formData: FormData) => {
    const result = await addPlayer(prevState, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, emptyPlayerFormState);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col gap-1">
        <Label htmlFor="gameName" className="text-xs text-grey-light">
          Game name
        </Label>
        <Input id="gameName" name="gameName" required />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="tagLine" className="text-xs text-grey-light">
          Tag line
        </Label>
        <Input id="tagLine" name="tagLine" required placeholder="LAS" className="w-24" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="platform" className="text-xs text-grey-light">
          Server
        </Label>
        <PlatformSelect />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="displayName" className="text-xs text-grey-light">
          Display name
        </Label>
        <Input id="displayName" name="displayName" required title="Permanent once added — also doubles as their login name" />
      </div>

      {/* Required, because the roster is five seats and a player with no seat
          cannot exist (migration 028). A plain <select> rather than the base-ui
          one: this form posts as FormData, and the styled Select is a
          controlled component that would need state for no gain here. */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="teamRole" className="text-xs text-grey-light">
          Position
        </Label>
        <select
          id="teamRole"
          name="teamRole"
          required
          defaultValue=""
          className="h-9 rounded-md border border-border bg-bg-secondary px-2 text-sm text-white"
        >
          <option value="" disabled>
            Pick one
          </option>
          {TEAM_ROLES.map((role) => (
            <option key={role} value={role}>
              {formatRole(role)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="avatar" className="text-xs text-grey-light">
          Avatar
        </Label>
        <input
          id="avatar"
          name="avatar"
          type="file"
          accept="image/*"
          className="text-xs text-grey-light file:mr-2 file:rounded file:border-0 file:bg-gold-muted file:px-2 file:py-1 file:text-white"
        />
      </div>

      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Adding…" : "Add player"}
      </Button>

      <p className="w-full text-xs text-grey-mid">
        The roster is five, one per position, so a new player needs a seat that is free —
        remove whoever holds it first. Display name can&apos;t be changed later; it also
        doubles as this player&apos;s login name. This Riot ID becomes their primary account;
        add smurfs and the account they flex on from the row below.
      </p>

      {state?.error && <p className="w-full text-sm text-loss">{state.error}</p>}
      {state?.message && <p className="w-full text-sm text-win">{state.message}</p>}
    </form>
  );
}
