// Which sources of games a page is describing.
//
// The app now records three kinds, and they answer different questions:
//
//   soloq  a Riot ranked solo/duo game — full detail, one tracked player
//   flexq  a Riot ranked flex game — identical detail, usually the whole roster
//   team   a scrim, friendly or tournament official — a draft and a scoreboard,
//          typed in or read from a .rofl, with no damage and no vision
//
// A scope is a set of them. Every page defaults to soloq alone, which is what
// the app meant by "a game" before any of this existed, so nothing changes
// under a page that wasn't given a scope.
//
// Pure: no I/O, no React, no Supabase.

import type { QueueScope } from "@/lib/data-source";

export type StatSource = "soloq" | "flexq" | "team";

export const STAT_SOURCE_LABELS: Record<StatSource, string> = {
  soloq: "SoloQ",
  flexq: "FlexQ",
  team: "Team matches",
};

/**
 * The named scopes the UI offers.
 *
 * Presets rather than a free set of checkboxes: most combinations are not
 * questions anybody asks ("flex and scrims but not soloQ"), and a URL that can
 * express eight states is eight states to get right in every loader.
 */
export const SCOPES = {
  /** What the app has always shown. The default everywhere. */
  soloq: ["soloq"],
  /** Both ranked queues — the same game, played alone or as a five. */
  ranked: ["soloq", "flexq"],
  /** How the roster does as a team: flex plus scrims, friendlies and officials. */
  team: ["flexq", "team"],
  /** Everything on record. */
  all: ["soloq", "flexq", "team"],
} as const satisfies Record<string, readonly StatSource[]>;

export type ScopeName = keyof typeof SCOPES;

export const SCOPE_LABELS: Record<ScopeName, string> = {
  soloq: "SoloQ",
  ranked: "Ranked",
  team: "Team",
  all: "Everything",
};

/**
 * What each scope says it is measuring.
 *
 * Shown next to the switch, because the difference between "Ranked" and
 * "Everything" is not guessable from the word, and a player page that silently
 * changed what it was counting would be worse than one that never offered to.
 */
export const SCOPE_CAPTIONS: Record<ScopeName, string> = {
  soloq: "Solo/duo queue only.",
  ranked: "Solo/duo and flex queue.",
  team: "Flex queue and every game played as a team.",
  // Names what a team match cannot answer, because the panels below quietly
  // keep reading the Riot games and a reader who assumed otherwise would take
  // a narrower number for a wider one.
  all: "Every game on record. Rank, timing, lane matchups, damage and game length come from the ranked games only — a team match records none of them.",
};

export const DEFAULT_SCOPE: ScopeName = "soloq";

/** `?scope=ranked`, falling back to soloQ — the reading that changes nothing. */
export function parseScope(value: string | string[] | undefined): ScopeName {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw in SCOPES ? (raw as ScopeName) : DEFAULT_SCOPE;
}

export function sourcesFor(scope: ScopeName): readonly StatSource[] {
  return SCOPES[scope];
}

export function includes(scope: ScopeName, source: StatSource): boolean {
  return (SCOPES[scope] as readonly StatSource[]).includes(source);
}

/**
 * Which participant view a scope reads.
 *
 * The Riot half of a scope maps onto the queue-scoped views from migration 024;
 * the team half is a different table and is loaded separately. A scope with no
 * Riot sources at all still has to name a view — `flex` is the harmless answer,
 * and no such scope exists today.
 */
export function queueScopeFor(scope: ScopeName): QueueScope {
  const solo = includes(scope, "soloq");
  const flex = includes(scope, "flexq");
  if (solo && flex) return "ranked";
  if (solo) return "solo";
  return "flex";
}

/** Whether a scope needs the team-match tables loaded at all. */
export function needsTeamMatches(scope: ScopeName): boolean {
  return includes(scope, "team");
}

/** Whether a scope reads any Riot game. False for a hypothetical team-only scope. */
export function needsRankedGames(scope: ScopeName): boolean {
  return includes(scope, "soloq") || includes(scope, "flexq");
}
