import type { SupabaseClient } from "@supabase/supabase-js";
import { FLEX_PARTICIPANTS, SOLOQ_PARTICIPANTS } from "@/lib/data-source";
import { ladderPoints } from "@/lib/rank";
import { aggregateDuoStats, duoWinRate, MIN_DUO_GAMES, type DuoInput } from "@/lib/duo-stats";
import { groupIntoSessions, type SessionInput } from "@/lib/sessions";
import { notifyDiscord } from "@/lib/discord";
import { mvpCountsByPlayer } from "@/lib/score";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

// The Sunday wrap.
//
// The value is the framing, not new analysis: a week is a unit people remember
// playing, where "since tracking started" is not. Nothing in this file calls
// Riot or anything metered; it's one participant query plus one rank-history
// query.
//
// It is also the last reader of `player_rank_history` (ADR-052). The site has
// no rank-over-time surface any more — no LP chart on a player page, no LP race
// — but a week's LP swing is the one form of it that survived, because a recap
// is about a period by construction and "you gained 40 LP" is the sentence
// people actually wanted from that chart.
//
// The rule that keeps this readable: a section that has nothing to say prints
// nothing. A wrap padded with "no notable duos this week" every week trains
// people to skim past the whole message.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Below this, a week's winrate is noise and the superlatives are meaningless. */
const MIN_GAMES_FOR_SUPERLATIVE = 5;

type PlayerRow = {
  id: string;
  display_name: string;
  tier: string | null;
  division: string | null;
  league_points: number | null;
};

type WeekRow = {
  match_id: string;
  player_id: string;
  team_id: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  performance_score: number | null;
  matches: { game_creation: string; game_duration_seconds: number } | null;
};

/**
 * A flex row from the same week.
 *
 * Only full-stack games are ever stored in queue 440 (isFullStack, in the
 * sync), so every one of these is a game the five played together — no filter
 * here has to re-establish that.
 */
type WeekFlexRaw = WeekFlexRow & { matches: { game_creation: string } | null };

export type WeekFlexRow = {
  match_id: string;
  player_id: string;
  win: boolean;
  performance_score: number | null;
};

type HistoryRow = {
  player_id: string;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  recorded_at: string;
};

type Flat = {
  match_id: string;
  player_id: string;
  team_id: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  performance_score: number | null;
  game_creation: string;
  game_duration_seconds: number;
};

function pct(wins: number, games: number): number {
  return games === 0 ? 0 : Math.round((wins / games) * 100);
}

export function buildWeeklyWrap(
  players: PlayerRow[],
  rows: Flat[],
  history: HistoryRow[],
  /** The week's full-stack flex games. Empty is normal — most weeks have none. */
  flexRows: WeekFlexRow[] = [],
  now = Date.now(),
): string | null {
  // A week with no games is the one case worth staying silent about entirely —
  // there is no wrap to write, and posting "0 games" every week during an
  // off-season is exactly the noise that gets a channel muted.
  if (rows.length === 0) return null;

  const nameOf = new Map(players.map((p) => [p.id, p.display_name]));
  const sections: string[] = [];

  // --- The week's record -------------------------------------------------
  const wins = rows.filter((r) => r.win).length;
  const uniqueGames = new Set(rows.map((r) => r.match_id)).size;
  sections.push(
    `**${rows.length}** games played across the roster (${uniqueGames} distinct), ` +
      `**${wins}W ${rows.length - wins}L** · ${pct(wins, rows.length)}%`,
  );

  // --- Per-player records ------------------------------------------------
  const byPlayer = new Map<string, { games: number; wins: number }>();
  for (const r of rows) {
    const agg = byPlayer.get(r.player_id) ?? { games: 0, wins: 0 };
    agg.games += 1;
    if (r.win) agg.wins += 1;
    byPlayer.set(r.player_id, agg);
  }

  const grinder = [...byPlayer.entries()].sort((a, b) => b[1].games - a[1].games)[0];
  if (grinder) {
    sections.push(
      `🎮 **Most games** — ${nameOf.get(grinder[0]) ?? "?"} with ${grinder[1].games} ` +
        `(${grinder[1].wins}W ${grinder[1].games - grinder[1].wins}L)`,
    );
  }

  const qualified = [...byPlayer.entries()].filter(
    ([, a]) => a.games >= MIN_GAMES_FOR_SUPERLATIVE,
  );
  if (qualified.length > 0) {
    const best = [...qualified].sort(
      (a, b) => pct(b[1].wins, b[1].games) - pct(a[1].wins, a[1].games),
    )[0];
    sections.push(
      `📈 **Best week** — ${nameOf.get(best[0]) ?? "?"} at ${pct(best[1].wins, best[1].games)}% ` +
        `over ${best[1].games} games`,
    );
  }

  // --- Best single game --------------------------------------------------
  // The performance score's one job is answering "was that any good", and a
  // week is exactly the window where one outlier game is still remembered. Only
  // rows that carry a score qualify: a game synced before the detail columns
  // existed cannot be compared with one that has them.
  const scored = rows.filter(
    (r): r is Flat & { performance_score: number } => r.performance_score !== null,
  );
  if (scored.length > 0) {
    const best = scored.reduce((a, b) => (b.performance_score > a.performance_score ? b : a));
    sections.push(
      `🏅 **Best game** — ${nameOf.get(best.player_id) ?? "?"} scored ` +
        `**${best.performance_score}** (${best.kills}/${best.deaths}/${best.assists})`,
    );
  }

  // --- LP movement -------------------------------------------------------
  // Baseline is the oldest point still inside the window; current is the
  // player's live rank. Both sides must be ranked for the difference to mean
  // anything — a placement finishing mid-week is not a climb.
  const baselines = new Map<string, HistoryRow>();
  for (const h of history) {
    if (now - new Date(h.recorded_at).getTime() > WEEK_MS) continue;
    if (!baselines.has(h.player_id)) baselines.set(h.player_id, h); // ascending: first = oldest
  }

  const deltas: Array<{ id: string; delta: number }> = [];
  for (const p of players) {
    const base = baselines.get(p.id);
    if (!base) continue;
    const before = ladderPoints(base);
    const after = ladderPoints(p);
    if (before === null || after === null || before === after) continue;
    deltas.push({ id: p.id, delta: after - before });
  }
  deltas.sort((a, b) => b.delta - a.delta);

  const climber = deltas[0];
  if (climber && climber.delta > 0) {
    sections.push(`🚀 **Biggest climb** — ${nameOf.get(climber.id) ?? "?"} +${climber.delta} LP`);
  }
  const faller = deltas[deltas.length - 1];
  // Guarded against reporting the same person as both when only one moved.
  if (faller && faller.delta < 0 && faller.id !== climber?.id) {
    sections.push(`🪂 **Biggest drop** — ${nameOf.get(faller.id) ?? "?"} ${faller.delta} LP`);
  }

  // --- Duo of the week ---------------------------------------------------
  const duos = aggregateDuoStats(rows as DuoInput[]).filter((d) => d.games >= MIN_DUO_GAMES);
  if (duos.length > 0) {
    const bestDuo = [...duos].sort((a, b) => duoWinRate(b) - duoWinRate(a))[0];
    // duoWinRate already returns a rounded 0-100 percentage, not a fraction —
    // every other call site uses it bare. Multiplying by 100 here produced
    // "4300%" in the first render against real data.
    sections.push(
      `🤝 **Duo of the week** — ${nameOf.get(bestDuo.a) ?? "?"} + ${nameOf.get(bestDuo.b) ?? "?"}, ` +
        `${bestDuo.wins}W ${bestDuo.games - bestDuo.wins}L (${duoWinRate(bestDuo)}%)`,
    );
  }

  // --- The team's week ---------------------------------------------------
  // A separate section rather than folded into the totals above, because it is
  // a different question: everything before this is five people on the ladder,
  // this is the five of them in one game. Silent when they didn't play as a
  // team, per the rule at the top of this file.
  if (flexRows.length > 0) {
    const games = new Map<string, boolean>();
    for (const r of flexRows) games.set(r.match_id, r.win);
    const teamWins = [...games.values()].filter(Boolean).length;
    sections.push(
      `⚔️ **Team week** — **${games.size}** flex game${games.size === 1 ? "" : "s"} as a full ` +
        `stack, **${teamWins}W ${games.size - teamWins}L** · ${pct(teamWins, games.size)}%`,
    );

    // MVP and INT only exist where several of us were in the same game, which is
    // what a flex game is and what a soloQ game never is — hence their living
    // here rather than beside the ladder superlatives above.
    const awards = mvpCountsByPlayer(
      flexRows.map((r) => ({
        match_key: r.match_id,
        player_id: r.player_id,
        performance_score: r.performance_score,
      })),
    );
    const ranked = [...awards.entries()];
    const mvp = [...ranked].sort((a, b) => b[1].mvps - a[1].mvps)[0];
    const int = [...ranked].sort((a, b) => b[1].ints - a[1].ints)[0];
    const parts: string[] = [];
    if (mvp && mvp[1].mvps > 0) {
      parts.push(`🏆 **MVP** — ${nameOf.get(mvp[0]) ?? "?"} (${mvp[1].mvps})`);
    }
    if (int && int[1].ints > 0) {
      parts.push(`😈 **INT** — ${nameOf.get(int[0]) ?? "?"} (${int[1].ints})`);
    }
    // One line, because the two belong together — best and worst of the same
    // five games, and splitting them puts a blank line between a joke and its
    // punchline.
    if (parts.length > 0) sections.push(parts.join("  ·  "));
  }

  // --- The worst session -------------------------------------------------
  // Per player, because a session is one person's queue run — grouping the
  // whole roster's games by time would stitch unrelated people's nights into a
  // single fictional session.
  let worst: { id: string; losses: number; games: number } | null = null;
  for (const [playerId] of byPlayer) {
    const own = rows.filter((r) => r.player_id === playerId) as SessionInput[];
    for (const session of groupIntoSessions(own)) {
      const losses = session.games.length - session.wins;
      if (losses >= 3 && (!worst || losses > worst.losses)) {
        worst = { id: playerId, losses, games: session.games.length };
      }
    }
  }
  if (worst) {
    sections.push(
      `💀 **Roughest session** — ${nameOf.get(worst.id) ?? "?"} went ` +
        `${worst.games - worst.losses}W ${worst.losses}L in one sitting`,
    );
  }

  return sections.join("\n\n");
}

/** Loads the week, formats it, and posts. */
export async function postWeeklyWrap(admin: SupabaseClient): Promise<void> {
  const since = new Date(Date.now() - WEEK_MS).toISOString();

  const [{ data: players, error }, rawRows, history, flexRows] = await Promise.all([
    admin
      .from("players")
      .select("id, display_name, tier, division, league_points")
      .returns<PlayerRow[]>(),
    fetchAllRows<WeekRow>((from, to) =>
      admin
        .from(SOLOQ_PARTICIPANTS)
        .select(
          "match_id, player_id, team_id, win, kills, deaths, assists, performance_score, " +
            "matches!inner(game_creation, game_duration_seconds)",
        )
        .not("player_id", "is", null)
        .gte("matches.game_creation", since)
        .range(from, to)
        .returns<WeekRow[]>(),
    ),
    fetchAllRows<HistoryRow>((from, to) =>
      admin
        .from("player_rank_history")
        .select("player_id, tier, division, league_points, recorded_at")
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: true })
        .range(from, to)
        .returns<HistoryRow[]>(),
    ),
    // Tracked players only: the other five in a flex game are strangers, and
    // both the record and the MVP comparison are about us.
    fetchAllRows<WeekFlexRaw>((from, to) =>
      admin
        .from(FLEX_PARTICIPANTS)
        .select("match_id, player_id, win, performance_score, matches!inner(game_creation)")
        .not("player_id", "is", null)
        .gte("matches.game_creation", since)
        .range(from, to)
        .returns<WeekFlexRaw[]>(),
    ),
  ]);
  if (error) throw new Error(error.message);

  // The embed-flattening step every read path in this app needs — game_creation
  // and duration live on matches, so they arrive nested.
  const rows: Flat[] = rawRows.map((r) => ({
    match_id: r.match_id,
    player_id: r.player_id,
    team_id: r.team_id,
    win: r.win,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    performance_score: r.performance_score,
    game_creation: r.matches?.game_creation ?? "",
    game_duration_seconds: r.matches?.game_duration_seconds ?? 0,
  }));

  const body = buildWeeklyWrap(
    players ?? [],
    rows,
    history,
    flexRows.map((r) => ({
      match_id: r.match_id,
      player_id: r.player_id,
      win: r.win,
      performance_score: r.performance_score,
    })),
  );
  if (!body) return;

  await notifyDiscord("📅 Week in review", body, "gold");
}
