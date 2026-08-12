// The contextual panel's filters: a board goes in, the rows that match come out.
//
// **Why /draft loads all four tables unfiltered.** loadDraftComps takes filter
// options and this file ignores every one of them, which looks like an
// oversight and isn't. The board changes on every click, and a server round
// trip per click would make the panel feel broken — so the four tables are
// loaded once on the server and filtered here, in the browser, against whatever
// is on the board at that moment. The whole dataset is ~170 profiles, a few
// dozen tags, some hundreds of counters and maybe a hundred comps: less than
// one page of /insights already pulls, and the same trade ADR-015 and ADR-024
// document for every stats page in the app. The options on loadDraftComps exist
// for callers that fetch one kind for one page; they stop being the wrong choice
// here only if the counters table reaches five figures, which it won't.
//
// Pure, on the same terms as lib/draft/board.ts: no React, no Supabase, nothing
// async, nothing mutated. Every function below is a scan over a few hundred
// rows and is called once per render of a panel that is usually closed.

import { filledSidePicks, type GameBoard, type Side } from "@/lib/draft/board";
import type {
  ChampionCounterRow,
  ChampionProfileRow,
  CounterIndex,
  DraftCompRow,
} from "@/lib/draft/types";

/**
 * Anything that answers "is this champion id in here" — a `Set`, or the `Map`
 * `unavailableInSeries` returns.
 *
 * The phase doc sketched this as the *available* set. It's the unavailable one
 * because that is what board.ts already produces, and building the complement
 * would mean passing the full roster in just to invert a set that is usually a
 * dozen entries long.
 */
export type IdLookup = { has(id: number): boolean };

export type BoardContext = {
  /** Our picks on the visible game, in slot order, holes dropped. */
  ourPicks: number[];
  /** Their picks, same. */
  theirPicks: number[];
};

export function otherSide(side: Side): Side {
  return side === "blue" ? "red" : "blue";
}

/**
 * Which picks are ours and which are theirs, for one game.
 *
 * Bans are deliberately not in here. Everything downstream either filters on
 * picks (a synergy is assembled out of picks) or on availability — and
 * availability is `unavailableInSeries`, which already counts this game's bans
 * *and* every pick carried from an earlier game. A separate "on this board" set
 * would be a strictly narrower version of a set the caller already holds.
 */
export function boardContext(board: GameBoard, ourSide: Side): BoardContext {
  return {
    ourPicks: filledSidePicks(board, ourSide),
    theirPicks: filledSidePicks(board, otherSide(ourSide)),
  };
}

// ------------------------------------------------------------
// Synergies
// ------------------------------------------------------------

/** Saved synergies whose champions are *all* among ours — already assembled. */
export function assembledSynergies(comps: DraftCompRow[], ourPicks: number[]): DraftCompRow[] {
  const ours = new Set(ourPicks);
  return comps.filter((c) => c.kind === "synergy" && c.champion_ids.every((id) => ours.has(id)));
}

export type NearSynergy = { comp: DraftCompRow; missing: number };

/**
 * Saved synergies one champion short, with the champion that would complete
 * them — the single most actionable thing this panel can show.
 *
 * **Ones whose missing champion can't be taken are dropped**, and that filter is
 * the reason `unavailable` has to be the *series-aware* set rather than this
 * game's board: suggesting a champion your jungler already played in game 1 is
 * exactly the mistake the fearless rule exists to prevent, and it would be a
 * confident, specific, wrong suggestion rather than an obviously empty one.
 */
export function nearSynergies(
  comps: DraftCompRow[],
  ourPicks: number[],
  unavailable: IdLookup,
): NearSynergy[] {
  const ours = new Set(ourPicks);
  const near: NearSynergy[] = [];
  for (const comp of comps) {
    if (comp.kind !== "synergy") continue;
    const missing = comp.champion_ids.filter((id) => !ours.has(id));
    if (missing.length !== 1) continue;
    if (unavailable.has(missing[0])) continue;
    near.push({ comp, missing: missing[0] });
  }
  return near;
}

// ------------------------------------------------------------
// Comps
// ------------------------------------------------------------

export type CompMatch = {
  comp: DraftCompRow;
  /** Champions of the comp we've already picked. */
  matched: number[];
  /** The rest, in stored order — which is role order for a five-champion comp. */
  missing: number[];
};

/**
 * Saved comps sharing at least `min` champions with our picks, most overlap
 * first.
 *
 * Returns the split rather than the bare rows the phase doc sketched, because
 * every caller needs it: a comp is only useful here if you can see which three
 * champions you already have and which two you'd still need.
 *
 * Ties keep the loader's order (`created_at desc`) — Array.prototype.sort is
 * stable, so two comps overlapping by three both stay where the query put them
 * instead of swapping between renders.
 */
export function matchingComps(comps: DraftCompRow[], ourPicks: number[], min = 2): CompMatch[] {
  const ours = new Set(ourPicks);
  return comps
    .flatMap((comp) => {
      if (comp.kind !== "comp") return [];
      const matched = comp.champion_ids.filter((id) => ours.has(id));
      if (matched.length < min) return [];
      return [
        {
          comp,
          matched,
          missing: comp.champion_ids.filter((id) => !ours.has(id)),
        },
      ];
    })
    .sort((a, b) => b.matched.length - a.matched.length);
}

// ------------------------------------------------------------
// Counters
// ------------------------------------------------------------
//
// Both of these read `counteredBy`, which looks like one of them is a
// copy-paste slip. It isn't. A row says `counter_champion_id` beats
// `target_champion_id`, so "what answers this champion" is always a lookup on
// the *target* side — the only thing that differs is whose picks you look up:
//
//   answers   target ∈ their picks  → counter_champion_id is a pick for us
//   watch out target ∈ our picks    → counter_champion_id is a pick to expect
//
// Getting this backwards would show the enemy's answers as ours, silently and
// plausibly. It is the failure this comment exists to prevent.

/** Champions we've noted as beating something they've picked. */
export function countersAgainst(index: CounterIndex, theirPicks: number[]): ChampionCounterRow[] {
  return theirPicks.flatMap((id) => index.counteredBy.get(id) ?? []);
}

/** Champions noted as beating something *we've* picked — what to expect. */
export function countersFacing(index: CounterIndex, ourPicks: number[]): ChampionCounterRow[] {
  return ourPicks.flatMap((id) => index.counteredBy.get(id) ?? []);
}

/**
 * The same rows, with the ones you can still act on first.
 *
 * A list of answers is only worth reading top-down if the top of it is
 * takeable. Six noted responses to their Nasus are worth nothing if the first
 * four are banned or already played, and scanning past them is work the panel
 * can do instead.
 *
 * Sorting rather than filtering, deliberately: "we had an answer to this and
 * it's gone" is real information about the draft you're in, and a row that
 * silently vanishes reads as a bug in the notes rather than a fact about the
 * board. Stable, so rows keep their per-target grouping inside each bucket.
 */
export function availableFirst(
  rows: ChampionCounterRow[],
  unavailable: IdLookup,
): ChampionCounterRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(unavailable.has(a.counter_champion_id)) -
      Number(unavailable.has(b.counter_champion_id)),
  );
}

// ------------------------------------------------------------
// Tags
// ------------------------------------------------------------

/**
 * How many of these picks carry each function tag.
 *
 * The "what is our comp actually made of" read: five champions and no Engage
 * between them is a thing worth noticing before the last pick, and it is not
 * visible from five portraits.
 *
 * Champions with no profile row simply contribute nothing — an unannotated
 * champion isn't untagged, it's unknown, and the histogram can't tell the
 * difference. The section says how many picks were annotated so the number has
 * a denominator you can trust.
 */
export function tagProfile(
  profiles: Map<number, ChampionProfileRow>,
  picks: number[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of picks) {
    for (const slug of profiles.get(id)?.tags ?? []) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return counts;
}

/** The histogram as a list, commonest first, ties alphabetical by slug. */
export function sortedTagCounts(counts: Map<string, number>): Array<[string, number]> {
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** How many of these picks have a profile row at all — the histogram's denominator. */
export function annotatedCount(profiles: Map<number, ChampionProfileRow>, picks: number[]): number {
  return picks.filter((id) => profiles.has(id)).length;
}
