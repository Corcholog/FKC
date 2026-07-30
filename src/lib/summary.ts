import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "@/lib/gemini";
import { formatRank, formatWinLoss, formatWinRate, rankSortKey } from "@/lib/rank";
import { getLatestVersion, getChampionMap, championDisplayName } from "@/lib/ddragon";
import {
  clanContextBlock,
  loadAiContext,
  playerContextLine,
  type AiContext,
} from "@/lib/ai-context";
import { aggregateDuoStats, duoWinRate, MIN_DUO_GAMES } from "@/lib/duo-stats";
import { streaksByPlayer } from "@/lib/streaks";

const RECENT_MATCH_LIMIT = 50;

// Shared closing instruction, so the team summary and the player summaries
// can't drift into different voices.
const VOICE_INSTRUCTION = `Casual tone, like a friend recapping the week — not a formal report. Do not use markdown formatting. You can roast people a bit. All output must be in natural Rioplatense Spanish (Argentina), as if one friend were talking to another. Feel free to use casual gaming slang. Do not use English except for League of Legends terms, champion names, or player names.`;

type RecentMatchRow = {
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
};

type MatchWithParticipant = {
  game_creation: string;
  match_participants: RecentMatchRow[];
};

type NoteRow = {
  note: string;
  match_participants: { champion_id: number; champion_name: string } | null;
};

export type SummaryResult = { summaryText: string; generatedAt: string } | { notEnoughData: true };

export async function generatePlayerSummary(
  supabase: SupabaseClient,
  playerId: string,
  // Passed in when generating a whole batch, so the daily run loads the clan
  // and player context once instead of once per player.
  preloadedContext?: AiContext,
): Promise<SummaryResult> {
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("display_name, tier, division, league_points, wins, losses")
    .eq("id", playerId)
    .single();
  if (playerError || !player) throw new Error("Player not found.");

  const aiContext = preloadedContext ?? (await loadAiContext(supabase));

  // Query from matches (not match_participants) so game_creation is a true
  // top-level column — see the same fix/comment in player/[slug]/page.tsx.
  // Getting this right actually matters here: with the broken order the
  // .limit(50) below was capping to 50 games in ~insertion order, not the
  // 50 most recent, silently feeding stale/arbitrary history into the prompt.
  const { data: recentMatchesRaw } = await supabase
    .from("matches")
    .select(
      "game_creation, match_participants!inner(champion_id, champion_name, win, kills, deaths, assists, total_cs, player_id)",
    )
    .eq("match_participants.player_id", playerId)
    .order("game_creation", { ascending: false })
    .limit(RECENT_MATCH_LIMIT)
    .returns<MatchWithParticipant[]>();

  const { data: notes } = await supabase
    .from("match_notes")
    .select("note, match_participants!inner(champion_id, champion_name, player_id)")
    .eq("match_participants.player_id", playerId)
    .order("created_at", { ascending: false })
    .returns<NoteRow[]>();

  // championName stored on match_participants is Riot's internal codename
  // (e.g. "MonkeyKing" for Wukong), not the display name — resolve through
  // DDragon before this ever reaches the prompt. Same fix as the UI side.
  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);
  const resolveName = (championId: number, fallback: string) =>
    championDisplayName(championId, championMap, fallback);

  const matches = (recentMatchesRaw ?? []).map((m) => {
    const p = m.match_participants[0];
    return { ...p, champion_name: resolveName(p.champion_id, p.champion_name) };
  });

  const noteRows = (notes ?? []).map((n) => ({
    ...n,
    match_participants: n.match_participants
      ? { ...n.match_participants, champion_name: resolveName(n.match_participants.champion_id, n.match_participants.champion_name) }
      : null,
  }));

  if (matches.length === 0 && noteRows.length === 0) {
    return { notEnoughData: true };
  }

  const prompt = buildPrompt(player, matches, noteRows, aiContext, playerId);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const summaryText = await generateText(prompt, apiKey);
  const generatedAt = new Date().toISOString();

  await supabase.from("player_ai_summaries").upsert(
    { player_id: playerId, summary_text: summaryText, generated_at: generatedAt, stale: false },
    { onConflict: "player_id" },
  );

  return { summaryText, generatedAt };
}

function buildPrompt(
  player: { display_name: string; tier: string | null; division: string | null; league_points: number | null; wins: number | null; losses: number | null },
  matches: RecentMatchRow[],
  notes: NoteRow[],
  aiContext: AiContext,
  playerId: string,
): string {
  const championStats = new Map<string, { games: number; wins: number }>();
  for (const m of matches) {
    const entry = championStats.get(m.champion_name) ?? { games: 0, wins: 0 };
    entry.games += 1;
    if (m.win) entry.wins += 1;
    championStats.set(m.champion_name, entry);
  }
  const championLines = [...championStats.entries()]
    .sort((a, b) => b[1].games - a[1].games)
    .slice(0, 8)
    .map(([champ, s]) => `- ${champ}: ${s.games} games, ${s.wins}W ${s.games - s.wins}L`)
    .join("\n");

  const matchLines = matches
    .slice(0, 15)
    .map((m) => `- ${m.win ? "Win" : "Loss"} on ${m.champion_name}, KDA ${m.kills}/${m.deaths}/${m.assists}, ${m.total_cs} CS`)
    .join("\n");

  const noteLines = notes
    .slice(0, 30)
    .map((n) => `- (${n.match_participants?.champion_name ?? "unknown champion"}) ${n.note}`)
    .join("\n");

  return `You are writing a short, casual scouting-report style summary for a friend group's private League of Legends ranked tracker. The player is "${player.display_name}".

${clanContextBlock(aiContext)}${playerContextLine(aiContext, playerId)}Current rank: ${formatRank(player.tier, player.division)}${player.tier ? ` (${player.league_points ?? 0} LP)` : ""}
Overall record: ${formatWinLoss(player.wins, player.losses)} (${formatWinRate(player.wins, player.losses)} winrate)

Champion performance (most-played first):
${championLines || "No champion data yet."}

Recent games (newest first):
${matchLines || "No recent games recorded."}

Notes the group has left on this player's games:
${noteLines || "No notes yet."}

Write a concise 3-5 sentence natural-language summary of how this player has been performing recently, weaving in the notes where relevant. ${VOICE_INSTRUCTION}`;
}

// ------------------------------------------------------------
// Team summary
// ------------------------------------------------------------

type TeamStatRow = {
  match_id: string;
  player_id: string | null;
  team_id: number;
  win: boolean;
  matches: { game_creation: string } | null;
};

// One roster-wide recap, generated by the daily batch and shown on the
// dashboard. Deliberately fed the group-level stats nobody sees on their own
// player page — duos, civil wars, who's on a heater — since a summary that just
// lists five individual records adds nothing over the award tiles above it.
export async function generateTeamSummary(
  supabase: SupabaseClient,
  preloadedContext?: AiContext,
): Promise<SummaryResult> {
  const aiContext = preloadedContext ?? (await loadAiContext(supabase));

  const [{ data: players }, { data: statRows }] = await Promise.all([
    supabase
      .from("players")
      .select("id, display_name, tier, division, league_points, wins, losses"),
    supabase
      .from("match_participants")
      .select("match_id, player_id, team_id, win, matches!inner(game_creation)")
      .not("player_id", "is", null)
      .returns<TeamStatRow[]>(),
  ]);

  const roster = players ?? [];
  const rows = (statRows ?? []).map((r) => ({
    match_id: r.match_id,
    player_id: r.player_id,
    team_id: r.team_id,
    win: r.win,
    game_creation: r.matches?.game_creation ?? "",
  }));

  if (roster.length === 0 || rows.length === 0) {
    return { notEnoughData: true };
  }

  const nameById = new Map(roster.map((p) => [p.id as string, p.display_name as string]));
  const nameOf = (id: string) => nameById.get(id) ?? "alguien";

  const rosterLines = [...roster]
    .sort((a, b) => rankSortKey(a) - rankSortKey(b))
    .map(
      (p) =>
        `- ${p.display_name}: ${formatRank(p.tier, p.division)}${
          p.tier ? ` (${p.league_points ?? 0} LP)` : ""
        }, ${formatWinLoss(p.wins, p.losses)} (${formatWinRate(p.wins, p.losses)})`,
    )
    .join("\n");

  const duoStats = aggregateDuoStats(rows);
  const duoLines = duoStats.duos
    .filter((d) => d.games >= MIN_DUO_GAMES)
    .slice(0, 5)
    .map(
      (d) =>
        `- ${nameOf(d.a)} + ${nameOf(d.b)}: ${d.games} games together, ${duoWinRate(d)}% winrate`,
    )
    .join("\n");

  const civilWarLines = duoStats.civilWars
    .slice(0, 5)
    .map(
      (w) =>
        `- ${nameOf(w.a)} vs ${nameOf(w.b)} (opposite teams): ${w.aWins}-${w.games - w.aWins} in favour of ${
          w.aWins * 2 > w.games ? nameOf(w.a) : nameOf(w.b)
        }`,
    )
    .join("\n");

  const streaks = streaksByPlayer(rows);
  const streakLines = [...streaks.entries()]
    .filter(([, s]) => Math.abs(s.current) >= 3)
    .sort(([, a], [, b]) => b.current - a.current)
    .map(([id, s]) => `- ${nameOf(id)} is on a ${Math.abs(s.current)}-game ${s.current > 0 ? "win" : "loss"} streak`)
    .join("\n");

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekRows = rows.filter((r) => new Date(r.game_creation).getTime() >= weekAgo);
  const weekWins = weekRows.filter((r) => r.win).length;

  const prompt = `You are writing the daily recap for a friend group's private League of Legends ranked tracker. Write about the group as a whole, not one person.

${clanContextBlock(aiContext)}Roster, best rank first:
${rosterLines}

Games in the last 7 days: ${weekRows.length} (${weekWins}W ${weekRows.length - weekWins}L across everyone)

Duos (games where two of them were on the same team):
${duoLines || "Nobody has duoed enough for this to mean anything yet."}

Games where two of them were matched against each other:
${civilWarLines || "No civil wars yet."}

Current streaks:
${streakLines || "Nobody is on a notable streak."}

Write a 4-6 sentence recap of how the group is doing. Single out whoever deserves it, good or bad, and mention the duos or head-to-heads if there's anything worth saying about them. Do not just list everyone's record one by one — say something about the group. ${VOICE_INSTRUCTION}`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const summaryText = await generateText(prompt, apiKey);
  const generatedAt = new Date().toISOString();

  await supabase
    .from("team_ai_summary")
    .upsert(
      { id: 1, summary_text: summaryText, generated_at: generatedAt, stale: false },
      { onConflict: "id" },
    );

  return { summaryText, generatedAt };
}
