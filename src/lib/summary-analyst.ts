// The public demo's player summaries.
//
// A second prompt profile over the same data as lib/summary.ts, not a variant
// of the same prompt. The private summary is written for the person it is
// about: it opens with what their friends wrote about them, quotes their own
// match notes back at them, and answers "how am I doing". This one is written
// for somebody deciding whether the tool is worth using — it never sees the
// notes or the context (gatherPlayerPromptData does not fetch them when given
// an alias map), it uses aliases throughout, and it answers "what would I need
// to know to play with or against this player".
//
// Written to demo_text rather than player_ai_summaries, and reviewed by hand in
// Settings before it is published. That review step is the point: the private
// summaries regenerate unattended every night, and nothing generated
// unattended should appear on a public page.

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "@/lib/gemini";
import { formatRank, formatWinLoss, formatWinRate } from "@/lib/rank";
import { championWinRate, championKdaRatio } from "@/lib/champion-stats";
import { matchupWinRate, matchupKdaRatio } from "@/lib/matchups";
import { formatRole } from "@/lib/roles";
import { NOTABLE_STREAK } from "@/lib/streaks";
import {
  detailLine,
  gatherPlayerPromptData,
  gatherTeamPromptData,
  pct,
  sessionBlock,
  teamPromptBlocks,
  trendBlock,
  MAX_CHAMPION_LINES,
  MAX_MATCHUP_LINES,
  type AliasMap,
  type PlayerPromptData,
  type TeamPromptData,
} from "@/lib/summary";

/**
 * The two rows a demo summary passes through, both in demo_text.
 *
 * They exist because the review step has to be real. demo_player_summaries
 * (migration 019) selects `source = 'player_summary'` and nothing else, so
 * writing a generated draft into that row would publish it the instant it was
 * written — which is exactly what this feature is supposed to prevent, and what
 * it did until this was split.
 *
 * Generation writes the draft row. Publishing copies it into the published row.
 * `source` is already half of demo_text's primary key, so this needed no schema
 * change: a draft and a publication are two rows for the same player.
 */
export const DEMO_SUMMARY_SOURCE = "player_summary";
export const DEMO_SUMMARY_DRAFT_SOURCE = "player_summary_draft";

/**
 * The same two states for the clan recap, which is one row rather than one per
 * player.
 *
 * `row_id` is "1" because the private recap it mirrors is the singleton
 * `team_ai_summary.id = 1`, and demo_text.row_id is that surface's id as text.
 * demo_team_summary (migration 021) reads the published source only, exactly as
 * demo_player_summaries does.
 */
export const DEMO_TEAM_SUMMARY_SOURCE = "team_summary";
export const DEMO_TEAM_SUMMARY_DRAFT_SOURCE = "team_summary_draft";
export const DEMO_TEAM_SUMMARY_ROW_ID = "1";

// English, unlike the private summaries, which are Rioplatense Spanish because
// the group is. The demo's entire chrome is English, and a Spanish paragraph
// inside it reads as an untranslated leftover rather than as a choice. One
// constant to flip if the audience turns out to prefer otherwise.
const ANALYST_DEMO_BASE = `Write in English. Neutral and factual — you are reading data, not judging a person. Do not mock, praise or editorialise, and do not try to be funny. Never state a number that does not appear in the data above; when you describe a pattern, name the numbers it rests on. Where a sample is small, say so rather than drawing a conclusion from it.`;

const ANALYST_DEMO_VOICE = `${ANALYST_DEMO_BASE} Do not refer to the player by any name other than "${"{alias}"}". Do not speculate about who they are.`;

// The group version of the last clause. The recap names several people, so the
// rule can't be a single alias — it's that the only names it may write are the
// ones it was handed, which are aliases by construction (gatherTeamPromptData
// drops anyone without one).
const ANALYST_DEMO_TEAM_VOICE = `${ANALYST_DEMO_BASE} Refer to the players only by the names given above, and do not speculate about who any of them are.`;

/**
 * Bullets rather than prose, which is the other half of what makes this a
 * different profile.
 *
 * A scouting read is skimmed next to four others, and the private summary's
 * three paragraphs are the wrong shape for that. It also happens to be the
 * shape that survives review: a claim per line is a claim you can strike out on
 * its own, where a paragraph has to be rewritten to remove one sentence.
 */
const BULLET_COUNT = "4 to 5";

export function buildAnalystPrompt(data: PlayerPromptData): string {
  const { player, signals, detailed } = data;
  const alias = player.display_name;

  const overallWins = signals.trend.lifetime.wins;
  const overallLosses = signals.trend.lifetime.games - overallWins;

  const roleLines = signals.roles
    .map(
      (r) =>
        `- ${formatRole(r.teamPosition)}: ${pct(r.winRate)} (${r.games} games, ${r.wins}W ${r.games - r.wins}L), KDA ${r.kda.toFixed(2)}, ${r.deathsPerGame.toFixed(1)} deaths/game`,
    )
    .join("\n");

  const championLines = signals.champions
    .slice(0, MAX_CHAMPION_LINES)
    .map(
      (c) =>
        `- ${c.championName}: ${pct(championWinRate(c))} (${c.games} games, ${c.wins}W ${c.games - c.wins}L), KDA ${championKdaRatio(c).toFixed(2)}`,
    )
    .join("\n");

  const matchupLines = signals.matchups
    .slice(0, MAX_MATCHUP_LINES)
    .map(
      (m) =>
        `- against ${m.championName} in lane: ${pct(matchupWinRate(m))} (${m.games} games, ${m.wins}W ${m.games - m.wins}L), this player's KDA in those games ${matchupKdaRatio(m).toFixed(2)}`,
    )
    .join("\n");

  const streak = signals.streak.current;
  const streakLine =
    Math.abs(streak) >= NOTABLE_STREAK
      ? `Currently on a ${Math.abs(streak)}-game ${streak > 0 ? "win" : "loss"} streak.`
      : "No notable streak right now.";

  return `You are writing a short scouting read on one League of Legends solo queue player, for a coaching staff evaluating a performance tracker. The player is anonymised and is referred to only as "${alias}".

Current rank: ${formatRank(player.tier, player.division)}${player.tier ? ` (${player.league_points ?? 0} LP)` : ""}
Overall record across every game this tracker has recorded: ${formatWinLoss(overallWins, overallLosses)} (${formatWinRate(overallWins, overallLosses)} winrate)

======================================================================
COMPUTED SPLITS — over all ${signals.totalGames} recorded games.
These were calculated exactly. Use them for any claim about the whole
history; do not try to derive totals by counting the ${detailed.length} games
listed further down.
======================================================================

RECENT FORM
${trendBlock(signals)}
${streakLine}

BY ROLE (roles with at least 3 games)
${roleLines || "Not enough games in any one role yet."}

BY CHAMPION (champions with at least 3 games, most played first)
${championLines || "No champion has enough games yet."}

LANE MATCHUPS (enemy laners faced at least 3 times, most faced first)
${matchupLines || "No lane opponent has been faced enough times yet."}

WINRATE BY POSITION IN A QUEUE SESSION
A "session" is consecutive games with no long break between them, so this is
how the player holds up as a night goes on.
${sessionBlock(signals)}

======================================================================
THE LAST ${detailed.length} GAMES, newest first.
Fields that this patch or this row did not record are left out entirely —
a missing field means unknown, never zero.
======================================================================

${detailed.map(detailLine).join("\n") || "No recent games recorded."}

Write ${BULLET_COUNT} scouting bullets about this player. Each bullet is one line starting with "- " and states one thing a coach would want to know: what they actually play and how it goes, where their form is relative to their own baseline, a concrete pattern the splits support (role, champion, lane matchup, session position, game length), and any clear weakness. If the data does not support a pattern, leave it out rather than inventing one. ${ANALYST_DEMO_VOICE.replace("{alias}", alias)}`;
}

export type AnalystSummary = { playerId: string; alias: string; summaryText: string };

/**
 * Generates one player's demo summary and returns it *without* writing.
 *
 * The write is the caller's, so the Settings action can generate the batch,
 * show it, and let somebody read it before any of it is published. Returns null
 * when the player has no history to summarise.
 */
export async function generateAnalystSummary(
  supabase: SupabaseClient,
  playerId: string,
  aliases: AliasMap,
): Promise<string | null> {
  const data = await gatherPlayerPromptData(supabase, playerId, { aliases });
  if (data === null) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  // The same low temperature the private analyst summary uses, for the same
  // reason: the failure mode of this prompt is an invented winrate, not a dull
  // sentence.
  return generateText(buildAnalystPrompt(data), apiKey, { temperature: 0.4 });
}

// ------------------------------------------------------------
// The clan recap
// ------------------------------------------------------------

export function buildAnalystTeamPrompt(data: TeamPromptData): string {
  const blocks = teamPromptBlocks(data);

  // No clanContextBlock, and not by omitting a line: gatherTeamPromptData never
  // reads the clan profile at all, so there is no variable here holding the
  // group's own blurb about itself. That text is theirs, it names people, and it
  // is the one thing on the private recap that a projection could never
  // anonymise.
  return `You are writing a short read on a League of Legends solo queue roster, for a coaching staff evaluating a performance tracker. The players are anonymised and are referred to only by the names below.

Roster, best rank first:
${blocks.roster}

Games in the last 7 days: ${data.weekGames} (${data.weekWins}W ${data.weekGames - data.weekWins}L across everyone)

Duos (games where two of them were on the same team):
${blocks.duos || "Nobody has duoed enough games together for this to mean anything yet."}

Games where two of them were matched against each other:
${blocks.civilWars || "No games where two of them were on opposite teams."}

Current streaks:
${blocks.streaks || "Nobody is on a notable streak."}

Write 3 to 5 sentences about this roster as a whole: how much it is playing, where it sits, and any group-level pattern the numbers above support — a duo that works, a head-to-head, somebody clearly carrying or sliding. Do not list every player's record one by one; the page this appears on already shows those. ${ANALYST_DEMO_TEAM_VOICE}`;
}

/**
 * Generates the demo's clan recap and returns it *without* writing.
 *
 * Prose rather than the bullets a player summary gets, because this lands in the
 * same narrow sidebar card the private recap does and answers one question
 * rather than five. Returns null when there is nothing to summarise — no
 * aliased player has any history.
 */
export async function generateAnalystTeamSummary(
  supabase: SupabaseClient,
  aliases: AliasMap,
): Promise<string | null> {
  const data = await gatherTeamPromptData(supabase, { aliases });
  if (data === null) return null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  return generateText(buildAnalystTeamPrompt(data), apiKey, { temperature: 0.4 });
}
