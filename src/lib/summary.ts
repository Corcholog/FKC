import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "@/lib/gemini";
import { formatRank, formatWinLoss, formatWinRate } from "@/lib/rank";
import { getLatestVersion, getChampionMap, championDisplayName } from "@/lib/ddragon";

const RECENT_MATCH_LIMIT = 50;

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
): Promise<SummaryResult> {
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("display_name, tier, division, league_points, wins, losses")
    .eq("id", playerId)
    .single();
  if (playerError || !player) throw new Error("Player not found.");

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

  const prompt = buildPrompt(player, matches, noteRows);
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

Current rank: ${formatRank(player.tier, player.division)}${player.tier ? ` (${player.league_points ?? 0} LP)` : ""}
Overall record: ${formatWinLoss(player.wins, player.losses)} (${formatWinRate(player.wins, player.losses)} winrate)

Champion performance (most-played first):
${championLines || "No champion data yet."}

Recent games (newest first):
${matchLines || "No recent games recorded."}

Notes the group has left on this player's games:
${noteLines || "No notes yet."}

Write a concise 3-5 sentence natural-language summary of how this player has been performing recently, weaving in the notes where relevant. Casual tone, like a friend recapping their session — not a formal report. Do not use markdown formatting. You can roast the player a bit. All output must be in natural Rioplatense Spanish (Argentina), as if one friend were talking to another. Feel free to use casual gaming slang. Do not use English except for League of Legends terms, champion names, or player names.`;
}
