// Row shapes and vocabulary for team matches — every game played as a team,
// whether a scrim, a friendly or a tournament official, entered by hand or
// read out of a .rofl replay.
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

export const TEAM_ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_SIDES = ["blue", "red"] as const;
export type TeamSide = (typeof TEAM_SIDES)[number];

export const TEAM_MATCH_KINDS = ["scrim", "friendly", "official"] as const;
export type TeamMatchKind = (typeof TEAM_MATCH_KINDS)[number];

export const TEAM_MATCH_KIND_LABELS: Record<TeamMatchKind, string> = {
  scrim: "Scrim",
  friendly: "Friendly",
  official: "Official",
};

/** Standard draft is five a side; the schema allows fewer, nothing allows more. */
export const BANS_PER_SIDE = 5;

/** Matches the `team_games_number` check constraint. */
export const MAX_GAMES_PER_SERIES = 10;

// ------------------------------------------------------------
// Rows, as they come back from PostgREST
// ------------------------------------------------------------

export type TeamOpponentRow = {
  id: string;
  name: string;
  slug: string;
  notes: string | null;
  /**
   * Champions we intend to ban against them, in priority order — a plan, not a
   * record. What we *have* banned is history, and lives in `team_games.ally_bans`.
   * Capped at BANS_PER_SIDE by a check constraint (migration 020).
   */
  target_bans: number[];
  created_at: string;
};

/**
 * A tournament. One row per competition, not per season of one.
 *
 * Exists because `kind` says a series was an official and stops there — which
 * is enough for one tournament and useless during the second. Scrims and
 * friendlies carry no competition at all.
 */
export type CompetitionRow = {
  id: string;
  name: string;
  slug: string;
  starts_on: string | null;
  ends_on: string | null;
};

export type TeamSeriesRow = {
  id: string;
  opponent_id: string;
  played_on: string;
  kind: TeamMatchKind;
  fearless: boolean;
  notes: string | null;
  /** Null for scrims and friendlies, and for officials nobody has attributed yet. */
  competition_id: string | null;
  /** Free text: "Fecha 3", "Playoffs QF". Null when it wasn't recorded. */
  stage: string | null;
  /** Private only — who entered the series. Not selected on the demo, and not in its view. */
  created_by?: string | null;
  created_at: string;
};

export type TeamGameRow = {
  id: string;
  series_id: string;
  game_number: number;
  /** Our side. Theirs is the other one. */
  side: TeamSide;
  win: boolean;
  duration_seconds: number | null;
  patch: string | null;
  ally_bans: number[];
  enemy_bans: number[];
  // No `notes` here. A game's notes are a thread in team_game_notes, loaded
  // separately by lib/team/notes.ts — five people review the same scrim, and
  // one column would be last-write-wins. Migration 013 dropped the column.
};

export type TeamPickRow = {
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
 * Assembled once per page by lib/team/queries.ts and folded many ways, the
 * same "fetch once, derive many" shape the dashboard uses.
 */
export type TeamGameView = TeamGameRow & {
  series: TeamSeriesRow;
  opponent: TeamOpponentRow;
  /** Resolved from series.competition_id. Null for anything that isn't an official. */
  competition: CompetitionRow | null;
  picks: TeamPickRow[];
};

/**
 * How a series is labelled in a chip: "Official", or "LIDE 2 · Fecha 3".
 *
 * The competition replaces the kind rather than sitting beside it — "Official"
 * next to "LIDE 2" says the same thing twice, and the tournament name is the
 * more specific half. A scrim or a friendly has no competition and keeps its
 * plain label.
 */
export function seriesLabel(
  series: Pick<TeamSeriesRow, "kind" | "stage">,
  competition: CompetitionRow | null,
): string {
  if (!competition) return TEAM_MATCH_KIND_LABELS[series.kind];
  return series.stage ? `${competition.name} · ${series.stage}` : competition.name;
}

export const isAlly = (p: TeamPickRow) => p.ally;
export const isEnemy = (p: TeamPickRow) => !p.ally;

/**
 * The name half of a stored `player_name`: `"Peluca#LAS"` → `"Peluca"`.
 *
 * A replay import writes the full Riot ID, because that is an identity — the
 * same account across a season, immune to the typo that splits one scouted
 * player into two. Hand entry writes whatever somebody typed, usually just the
 * nickname.
 *
 * So both forms are in the column, and everything that *identifies* a person
 * has to fold them together while everything that *displays* one can show the
 * full thing where it fits. A Riot game name can't itself contain a `#`, which
 * is what makes the split unambiguous.
 */
export function nicknameOf(playerName: string): string {
  const hash = playerName.indexOf("#");
  return hash > 0 ? playerName.slice(0, hash) : playerName;
}

/** Whether a stored name carries a tag line, and so is the more specific of two spellings. */
export function hasRiotTag(playerName: string): boolean {
  return playerName.indexOf("#") > 0;
}

/** Their side, given ours. Draft analysis cares which one had first pick. */
export function enemySide(ourSide: TeamSide): TeamSide {
  return ourSide === "blue" ? "red" : "blue";
}

/**
 * Blue side picks first in every standard draft, so "did we first-pick this
 * game" is exactly "were we blue" — no extra column needed.
 */
export function hadFirstPick(game: Pick<TeamGameRow, "side">): boolean {
  return game.side === "blue";
}
