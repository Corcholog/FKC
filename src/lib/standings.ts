import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRank, ladderPoints, rankSortKey, type RankPosition } from "@/lib/rank";
import { notifyDiscord } from "@/lib/discord";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

// The daily standings post.
//
// A leaderboard on its own is the least interesting thing this app could send:
// it's the same order most days, and it's already on the dashboard. What makes
// a *daily* post worth reading is the delta — who moved since yesterday — so
// the LP change is the point and the ordering is the frame around it.
//
// Reads only `players` and `player_rank_history`, both of which the sync has
// already written by the time this runs. No Riot calls, no Gemini.

type PlayerRow = {
  display_name: string;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  wins: number | null;
  losses: number | null;
};

type HistoryRow = {
  player_id: string;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  recorded_at: string;
};

/**
 * How far back the "yesterday" baseline is taken from.
 *
 * Matches RANK_HISTORY_MAX_GAP_MS in sync.ts: a point is written whenever the
 * rank moved *or* the newest one is 20h old, so 20h is the shortest window
 * guaranteed to contain a baseline for an active player. Anything shorter and a
 * plateau would show no baseline; much longer and "since yesterday" stops being
 * true.
 */
const BASELINE_MIN_AGE_MS = 20 * 60 * 60 * 1000;

/** How far back to look for a baseline before giving up on one. */
const BASELINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function formatDelta(delta: number | null): string {
  if (delta === null) return "";
  if (delta === 0) return " · —";
  return delta > 0 ? ` · ▲ +${delta} LP` : ` · ▼ ${delta} LP`;
}

function winRate(wins: number, losses: number): string {
  const games = wins + losses;
  if (games === 0) return "no games yet";
  return `${wins}W ${losses}L · ${Math.round((wins / games) * 100)}%`;
}

/**
 * Builds the message body. Split from the sending so the formatting is
 * inspectable without a webhook — the one part of this worth eyeballing.
 */
export function buildStandings(
  players: Array<PlayerRow & { id: string }>,
  history: HistoryRow[],
  now = Date.now(),
): string | null {
  if (players.length === 0) return null;

  // The most recent snapshot that is already old enough to count as yesterday.
  // History rows are sparse by design, so this picks per player rather than
  // assuming everyone has a point at the same time.
  const baselines = new Map<string, RankPosition>();
  for (const row of history) {
    const age = now - new Date(row.recorded_at).getTime();
    if (age < BASELINE_MIN_AGE_MS || age > BASELINE_MAX_AGE_MS) continue;

    // Rows arrive sorted ascending, so the last one to pass the age filter is
    // the newest eligible point and overwriting is exactly what we want.
    baselines.set(row.player_id, row);
  }

  const ranked = [...players].sort((a, b) => rankSortKey(a) - rankSortKey(b));

  const lines = ranked.map((p, i) => {
    const current = ladderPoints(p);
    const baseline = baselines.get(p.id);
    const before = baseline ? ladderPoints(baseline) : null;
    // Unranked on either side means there's no comparable number, not a zero.
    const delta = current !== null && before !== null ? current - before : null;

    const lp = p.league_points === null ? "" : `, ${p.league_points} LP`;
    return (
      `**${i + 1}.** ${p.display_name} — ${formatRank(p.tier, p.division)}${lp}${formatDelta(delta)}\n` +
      `> ${winRate(p.wins ?? 0, p.losses ?? 0)}`
    );
  });

  return lines.join("\n");
}

/** Loads the data, formats it, and posts. Never throws — notifyDiscord doesn't. */
export async function postDailyStandings(admin: SupabaseClient): Promise<void> {
  const { data: players, error } = await admin
    .from("players")
    .select("id, display_name, tier, division, league_points, wins, losses")
    .returns<Array<PlayerRow & { id: string }>>();
  if (error) throw new Error(error.message);

  const since = new Date(Date.now() - BASELINE_MAX_AGE_MS).toISOString();
  const history = await fetchAllRows<HistoryRow>((from, to) =>
    admin
      .from("player_rank_history")
      .select("player_id, tier, division, league_points, recorded_at")
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: true })
      .range(from, to)
      .returns<HistoryRow[]>(),
  );

  const body = buildStandings(players ?? [], history);
  if (!body) return;

  await notifyDiscord("🏆 Daily standings", body, "gold");
}
