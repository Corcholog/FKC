// Which games a team player's numbers were built from.
//
// Close to `lib/scope.ts`'s `ScopeName` and deliberately not the same thing.
// That one exists for /player/[slug], where the subject is a person and the
// default is solo queue; this one is for /team/players, where the subject is
// somebody's competitive record and the interesting cut is scrims-and-officials
// against flex. Sharing a vocabulary would mean one of the two pages offering a
// combination it has no use for.
//
// Pure: no I/O, no React.

import type { StatSource } from "@/lib/scope";

export const PLAYER_SOURCES = ["all", "competitive", "flex", "soloq"] as const;
export type PlayerSource = (typeof PLAYER_SOURCES)[number];

export const PLAYER_SOURCE_LABELS: Record<PlayerSource, string> = {
  all: "Everything",
  competitive: "Competitive",
  flex: "Flex",
  soloq: "SoloQ",
};

/**
 * Which records each source reads.
 *
 * "Competitive" is every hand-entered or replay-imported game — scrims,
 * friendlies and officials alike. It is one word for "the games we prepared
 * for", and splitting it further belongs on the scouting page, which already
 * has a filter bar for exactly that.
 */
const SOURCE_RECORDS: Record<PlayerSource, StatSource[]> = {
  all: ["soloq", "flexq", "team"],
  competitive: ["team"],
  flex: ["flexq"],
  soloq: ["soloq"],
};

export function recordsFor(source: PlayerSource): StatSource[] {
  return SOURCE_RECORDS[source];
}

/** Anything unrecognised falls back to everything, never to nothing. */
export function parsePlayerSource(raw: string | string[] | undefined): PlayerSource {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return PLAYER_SOURCES.find((s) => s === value) ?? "all";
}
