// Which games a page is describing.
//
// The app records three kinds, and they answer different questions:
//
//   soloq  a Riot ranked solo/duo game — full detail, one player of ours
//   flexq  a Riot ranked flex game — identical detail, the whole team
//   team   a scrim, friendly or tournament official — a draft and a scoreboard,
//          typed in or read from a .rofl, with no damage and no vision
//
// A *source* is a named set of them. There used to be two vocabularies for this
// — `ScopeName` here for /players/[slug] and `PlayerSource` in
// lib/team/player-source.ts for /team/players — because one page was about a
// person's solo queue and the other about their competitive record. Those are
// one page now, so this is one vocabulary.
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
 * The named sources the UI offers.
 *
 * Presets rather than a free set of checkboxes: most combinations are not
 * questions anybody asks ("flex and scrims but not soloQ"), and a URL that can
 * express eight states is eight states to get right in every loader.
 *
 * "Competitive" is every hand-entered or replay-imported game — scrims,
 * friendlies and officials alike. One word for "the games we prepared for";
 * splitting it further belongs on /prep/scouting, which has a filter bar for
 * exactly that.
 */
export const SOURCES = {
  /** Everything on record. */
  all: ["soloq", "flexq", "team"],
  /** Scrims, friendlies and officials. */
  competitive: ["team"],
  /** Ranked flex — which, since the sync's gate, is only ever the five of them. */
  flex: ["flexq"],
  /** Solo/duo queue. */
  soloq: ["soloq"],
} as const satisfies Record<string, readonly StatSource[]>;

export type SourceName = keyof typeof SOURCES;

export const SOURCE_NAMES = Object.keys(SOURCES) as SourceName[];

export const SOURCE_LABELS: Record<SourceName, string> = {
  all: "Everything",
  competitive: "Competitive",
  flex: "Flex",
  soloq: "SoloQ",
};

/**
 * What each source says it is measuring.
 *
 * Shown next to the switch, because the difference between "Everything" and
 * "Competitive" is not guessable from the word, and a page that silently changed
 * what it was counting would be worse than one that never offered to.
 */
export const SOURCE_CAPTIONS: Record<SourceName, string> = {
  // Names what a team match cannot answer, because the panels below quietly
  // keep reading the Riot games and a reader who assumed otherwise would take a
  // narrower number for a wider one.
  all: "Every game on record. Rank, timing, lane matchups, damage and game length come from the ranked games only — a team match records none of them.",
  competitive: "Scrims, friendlies and tournament officials. No damage, vision or LP — none of it is recorded for a game Riot's API doesn't serve.",
  flex: "Ranked flex, which is only ever the five of us: the sync stores a flex game when it finds the whole team on one side, and drops it otherwise.",
  soloq: "Solo/duo queue only.",
};

/**
 * Everything, because this app is about a team that plays three kinds of game
 * and showing one of them by default would understate two.
 */
export const DEFAULT_SOURCE: SourceName = "all";

/** `?source=flex`, falling back to everything — never to nothing. */
export function parseSource(value: string | string[] | undefined): SourceName {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw in SOURCES ? (raw as SourceName) : DEFAULT_SOURCE;
}

export function recordsFor(source: SourceName): readonly StatSource[] {
  return SOURCES[source];
}

export function includes(source: SourceName, record: StatSource): boolean {
  return (SOURCES[source] as readonly StatSource[]).includes(record);
}

/**
 * Which participant view a source reads.
 *
 * The Riot half maps onto the queue-scoped views from migration 024; the team
 * half is a different table and is loaded separately. A source with no Riot
 * records still has to name a view — `flex` is the harmless answer, and
 * `needsRankedGames` is false there so nothing reads it.
 */
export function queueScopeFor(source: SourceName): QueueScope {
  const solo = includes(source, "soloq");
  const flex = includes(source, "flexq");
  if (solo && flex) return "ranked";
  if (solo) return "solo";
  return "flex";
}

/** Whether this source needs the team-match tables loaded at all. */
export function needsTeamMatches(source: SourceName): boolean {
  return includes(source, "team");
}

/** Whether this source reads any Riot game. False for "competitive". */
export function needsRankedGames(source: SourceName): boolean {
  return includes(source, "soloq") || includes(source, "flexq");
}
