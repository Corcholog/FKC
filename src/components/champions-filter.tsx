"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Player = {
  id: string;
  slug: string;
  display_name: string;
};

export function ChampionsFilter({
  players,
  selectedId,
  basePath = "",
}: {
  players: Player[];
  selectedId: string;
  /** "" in the private app, "/demo" in the public one. */
  basePath?: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={selectedId}
      onValueChange={(value) => router.push(`${basePath}/champions?player=${value}`)}
    >
      <SelectTrigger className="w-44">
        <SelectValue>{(value: string) => players.find((p) => p.slug === value)?.display_name}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {players.map((p) => (
          <SelectItem key={p.id} value={p.slug}>
            {p.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
