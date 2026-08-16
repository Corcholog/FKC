// Row shapes and vocabulary for scrims — hand-entered tournament games.
//
// The snake_case is deliberate and load-bearing, not just "that's what Postgres
// returned". Two existing pure helpers accept these rows with no adapter
// precisely because the column names line up:
//
//   * `team_position` holding Riot's own strings makes sortByRole / formatRole
//     (lib/roles.ts) work directly, and sortByRole is generic over
//     `{ team_position: string | null }`.
//   * a pick joined to its game is structurally a ChampionStatInput
//     (lib/champion-stats.ts), so topChampionsByPlayer, championWinRate and
//     championKdaRatio work directly too.
//
// See docs/migrations/012_scrims.sql for why scrims don't share the soloq
// tables outright.

export const SCRIM_ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type ScrimRole = (typeof SCRIM_ROLES)[number];

export const SCRIM_SIDES = ["blue", "red"] as const;
export type ScrimSide = (typeof SCRIM_SIDES)[number];

export const SCRIM_KINDS = ["scrim", "friendly", "official"] as const;
export type ScrimKind = (typeof SCRIM_KINDS)[number];

export const SCRIM_KIND_LABELS: Record<ScrimKind, string> = {
  scrim: "Scrim",
  friendly: "Friendly",
  official: "Official",
};

/** Standard draft is five a side; the schema allows fewer, nothing allows more. */
export const BANS_PER_SIDE = 5;

/** Matches the `scrim_games_number` check constraint. */
export const MAX_GAMES_PER_SERIES = 10;

// ------------------------------------------------------------
// Rows, as they come back from PostgREST
// ------------------------------------------------------------

export type ScrimOpponentRow = {
  id: string;
  name: string;
  slug: string;
  notes: string | null;
  /**
   * Champions we intend to ban against them, in priority order — a plan, not a
   * record. What we *have* banned is history, and lives in `scrim_games.ally_bans`.
   * Capped at BANS_PER_SIDE by a check constraint (migration 020).
   */
  target_bans: number[];
  created_at: string;
};

export type ScrimSeriesRow = {
  id: string;
  opponent_id: string;
  played_on: string;
  kind: ScrimKind;
  fearless: boolean;
  notes: string | null;
  /** Private only — who entered the series. Not selected on the demo, and not in its view. */
  created_by?: string | null;
  created_at: string;
};

export type ScrimGameRow = {
  id: string;
  series_id: string;
  game_number: number;
  /** Our side. Theirs is the other one. */
  side: ScrimSide;
  win: boolean;
  duration_seconds: number | null;
  patch: string | null;
  ally_bans: number[];
  enemy_bans: number[];
  // No `notes` here. A game's notes are a thread in scrim_game_notes, loaded
  // separately by lib/scrims/notes.ts — five people review the same scrim, and
  // one column would be last-write-wins. Migration 013 dropped the column.
};

export type ScrimPickRow = {
  id: string;
  game_id: string;
  ally: boolean;
  team_position: string;
  champion_id: number;
  champion_name: string;
  /** Null for every enemy, and for an ally substitute who isn't on the roster. */
  player_id: string | null;
  /** A substitute's name, or the enemy's nickname. Optional on both sides. */
  player_name: string | null;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
};

// ------------------------------------------------------------
// The joined shape every stat module takes
// ------------------------------------------------------------

/**
 * One game with everything needed to say anything about it: its draft, its
 * result, and which opponent it was against.
 *
 * Assembled once per page by lib/scrims/queries.ts and folded many ways, the
 * same "fetch once, derive many" shape the dashboard uses.
 */
export type ScrimGameView = ScrimGameRow & {
  series: ScrimSeriesRow;
  opponent: ScrimOpponentRow;
  picks: ScrimPickRow[];
};

export const isAlly = (p: ScrimPickRow) => p.ally;
export const isEnemy = (p: ScrimPickRow) => !p.ally;

/** Their side, given ours. Draft analysis cares which one had first pick. */
export function enemySide(ourSide: ScrimSide): ScrimSide {
  return ourSide === "blue" ? "red" : "blue";
}

/**
 * Blue side picks first in every standard draft, so "did we first-pick this
 * game" is exactly "were we blue" — no extra column needed.
 */
export function hadFirstPick(game: Pick<ScrimGameRow, "side">): boolean {
  return game.side === "blue";
}
