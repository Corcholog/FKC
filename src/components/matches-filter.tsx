"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Player = {
  id: string;
  slug: string;
  display_name: string;
};

export function MatchesFilter({
  players,
  selectedId,
  basePath = "",
}: {
  players: Player[];
  selectedId: string | null;
  /** "/demo" on the public copy, so the filter stays inside its own route group. */
  basePath?: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={selectedId ?? "all"}
      onValueChange={(value) => {
        router.push(value === "all" ? `${basePath}/matches` : `${basePath}/matches?player=${value}`);
      }}
    >
      <SelectTrigger className="w-44">
        <SelectValue>
          {(value: string) => (value === "all" ? "All players" : players.find((p) => p.slug === value)?.display_name)}
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
