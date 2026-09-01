"use client";

import { useRouter } from "next/navigation";
import { SOLOQ_VIEW } from "@/components/matches/match-view-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Player = {
  id: string;
  slug: string;
  display_name: string;
};

/**
 * Whose solo queue history to show.
 *
 * There used to be a queue picker beside this one, because /matches read one of
 * three participant views. It doesn't any more: flex is a team game and lives in
 * the team-game half of this page, one row per game rather than one per player,
 * so the only queue this list can be about is solo.
 *
 * `view=soloq` rides along on every link. Dropping it would send a player filter
 * back to the team-game tab, which does not have one.
 */
export function MatchesFilter({
  players,
  selectedId,
}: {
  players: Player[];
  selectedId: string | null;
}) {
  const router = useRouter();

  const hrefFor = (player: string | null) => {
    const params = new URLSearchParams({ view: SOLOQ_VIEW });
    if (player) params.set("player", player);
    return `/matches?${params.toString()}`;
  };

  return (
    <Select
      value={selectedId ?? "all"}
      onValueChange={(value) => {
        router.push(hrefFor(value === "all" ? null : value));
      }}
    >
      <SelectTrigger className="w-44">
        <SelectValue>
          {(value: string) =>
            value === "all" ? "All players" : players.find((p) => p.slug === value)?.display_name
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All players</SelectItem>
        {players.map((p) => (
          <SelectItem key={p.id} value={p.slug}>
            {p.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
