"use client";

import { useState, useTransition } from "react";
import { setTeamRole } from "@/app/(app)/settings/actions";
import { formatRole } from "@/lib/roles";
import { TEAM_ROLES } from "@/lib/team/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Which position this player plays on the main team, or none.
//
// This is the control that decides what the whole /team section is about, so it
// sits on the player row rather than in a corner: five of these set to a
// position *are* the team, and every record, chart and roster under /team is
// derived from them.
//
// A select rather than a toggle because the role is the useful half. "On the
// team" with no position would still leave the team ordered alphabetically,
// which is the thing migration 026 exists to stop.

/** The sentinel for "not on the team" — Select needs a value, and null isn't one. */
const NONE = "none";

export function TeamRoleSelect({
  playerId,
  role,
}: {
  playerId: string;
  /** Null when this player is in the friend group but not on the main team. */
  role: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Optimistic, so the select doesn't snap back to its old value for the
  // duration of the round trip. The server action revalidates on success, which
  // is what makes this correct rather than merely fast.
  const [value, setValue] = useState(role ?? NONE);

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={value}
        onValueChange={(raw) => {
          // base-ui types the value as nullable; this Select has no clear
          // affordance, so a null can only mean "unchanged".
          const next = typeof raw === "string" ? raw : NONE;
          const previous = value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            try {
              await setTeamRole(playerId, next === NONE ? null : next);
            } catch (e) {
              setValue(previous);
              setError(e instanceof Error ? e.message : "Failed to set the role.");
            }
          });
        }}
        disabled={pending}
      >
        <SelectTrigger
          size="sm"
          className={cn("w-32", value === NONE && "text-grey-mid")}
          aria-label="Main team position"
        >
          <SelectValue>
            {(v: string) => (v === NONE ? "Not on team" : formatRole(v))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not on team</SelectItem>
          {TEAM_ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {formatRole(r)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}
