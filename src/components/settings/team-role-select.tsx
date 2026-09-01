"use client";

import { useState, useTransition } from "react";
import { setTeamRole } from "@/app/(app)/settings/actions/roster";
import { formatRole } from "@/lib/roles";
import { TEAM_ROLES } from "@/lib/team/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Which position this player plays.
//
// There is no "not on the team" option any more, and that is the point of
// migration 028: `players.team_role` is `not null` and unique, so the table is
// the team and every row has exactly one seat. Picking a position somebody else
// holds swaps the two of them — which is the only edit the schema permits, and
// also the only one anybody has ever wanted from this control.
//
// A select rather than a drag handle because five rows do not need a drag
// library, and because the swap is easier to read as "put them at mid" than as
// a reorder whose second effect is implicit.

export function TeamRoleSelect({
  playerId,
  role,
}: {
  playerId: string;
  role: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Optimistic, so the select doesn't snap back to its old value for the
  // duration of the round trip. The server action revalidates on success, which
  // is what makes this correct rather than merely fast.
  //
  // Only this half of the swap is optimistic: the other player's row is
  // re-rendered by the revalidation, so for one paint two rows can read as the
  // same position. That is the honest picture of a swap in flight, and the
  // alternative — lifting both into one client component — would put the whole
  // roster behind a "use client" boundary to smooth over 200ms.
  const [value, setValue] = useState(role);

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={value}
        onValueChange={(raw) => {
          // base-ui types the value as nullable; this Select has no clear
          // affordance, so a null can only mean "unchanged".
          if (typeof raw !== "string" || raw === value) return;
          const previous = value;
          setValue(raw);
          setError(null);
          startTransition(async () => {
            try {
              await setTeamRole(playerId, raw);
            } catch (e) {
              setValue(previous);
              setError(e instanceof Error ? e.message : "Failed to set the role.");
            }
          });
        }}
        disabled={pending}
      >
        <SelectTrigger size="sm" className="w-32" aria-label="Team position">
          <SelectValue>{(v: string) => formatRole(v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
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
