"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QUEUE_SCOPE_LABELS, type QueueScope } from "@/lib/data-source";

type Player = {
  id: string;
  slug: string;
  display_name: string;
};

const QUEUES: QueueScope[] = ["solo", "flex", "ranked"];

export function MatchesFilter({
  players,
  selectedId,
  queue,
  basePath = "",
}: {
  players: Player[];
  selectedId: string | null;
  queue: QueueScope;
  /** "/demo" on the public copy, so the filter stays inside its own route group. */
  basePath?: string;
}) {
  const router = useRouter();

  // Both filters write the same URL, so each has to carry the other's value or
  // changing one would silently reset the other. The default is left out rather
  // than spelled in, so the plain /matches URL stays canonical.
  const hrefFor = (player: string | null, nextQueue: QueueScope) => {
    const params = new URLSearchParams();
    if (player) params.set("player", player);
    if (nextQueue !== "solo") params.set("queue", nextQueue);
    const query = params.toString();
    return query ? `${basePath}/matches?${query}` : `${basePath}/matches`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
    <Select
      value={selectedId ?? "all"}
      onValueChange={(value) => {
        router.push(hrefFor(value === "all" ? null : value, queue));
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

    <Select
      value={queue}
      onValueChange={(value) => {
        router.push(hrefFor(selectedId, value as QueueScope));
      }}
    >
      <SelectTrigger className="w-32">
        <SelectValue>{(value: string) => QUEUE_SCOPE_LABELS[value as QueueScope]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {QUEUES.map((q) => (
          <SelectItem key={q} value={q}>
            {QUEUE_SCOPE_LABELS[q]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    </div>
  );
}
