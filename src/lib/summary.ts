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
import { streaksByPlayer, NOTABLE_STREAK } from "@/lib/streaks";
import {
  computePlayerSignals,
  MIN_SPLIT_GAMES,
  type PlayerSignals,
  type SignalRow,
} from "@/lib/player-signals";
import { championWinRate, championKdaRatio } from "@/lib/champion-stats";
import { matchupWinRate, matchupKdaRatio, type MatchupInput } from "@/lib/matchups";
import { findLaneOpponent, formatRole, isSupport } from "@/lib/roles";
import {
  csPerMinute,
  damagePerMinute,
  deathsPerGame,
  kdaRatio,
  playerWinRate,
  visionScorePerMinute,
  TREND_WINDOW,
} from "@/lib/player-stats";
import { formatDuration, formatKillParticipation } from "@/lib/format";
import { ROSTER_TIME_ZONE } from "@/lib/time-stats";

// How many games the model sees game-by-game. Everything older is still
// represented, but as numbers computed in lib/player-signals.ts rather than as
// rows — see the header comment there for why that split exists at all.
//
// Not a cost limit. Even the player's whole history is pennies per call and the
// project runs on the free tier anyway; what a bigger window actually costs is
// the batch's 60s ceiling and the model's attention. Thirty games is roughly a
// month for a regular player, which is the span "recently" is asking about.
const DETAIL_MATCH_LIMIT = 30;

// The notes query used to be unbounded and then sliced in the prompt builder,
// which meant a chatty group pulled hundreds of rows to throw most away.
const MAX_NOTES = 40;

// How much has to have changed before a summary is worth rewriting.
//
// The scarce resource is requests per day, not tokens: the free tier caps how
// many times we may call at all, while the prompt itself is effectively free at
// any size we'd send. Before this, one ranked game made a player stale and the
// batch spent a request on a summary that would read almost identically — so
// the budget went on frequency, and the prompt above had to stay thin to fit.
//
// Trading that the other way round is strictly better here: a summary five
// games out of date is still true, where a thin one is vague every day.
//
// Lives here rather than in the route because the player page shows the count
// too ("3 new games since — refreshes at 5"), and a UI that promised a
// different threshold from the one the batch enforces would be worse than
// saying nothing. Enforced in src/app/api/summaries/route.ts.
export const MIN_NEW_GAMES = 5;

const MAX_CHAMPION_LINES = 10;
const MAX_MATCHUP_LINES = 6;

// Language rules, shared so the two prompts can't drift into different
// languages. Tone is deliberately *not* shared any more: the player summary is
// an objective read of the data and the clan recap is a friend talking, and one
// constant can't be both. See docs/engineering/06-ai-layer.md §6.
const SHARED_LANGUAGE = `Do not use markdown formatting, headings, bullet points or asterisks. All output must be in natural Rioplatense Spanish (Argentina). Do not use English except for League of Legends terms, champion names, or player names.`;

const RECAP_VOICE = `Casual tone, like a friend recapping the week — not a formal report, as if one friend were talking to another. You can roast people a bit. Feel free to use casual gaming slang. ${SHARED_LANGUAGE}`;

// The counterpart. The last two sentences are the ones doing the work: the
// failure mode of this prompt is not a bad tone, it's a confident number that
// isn't in the input.
const ANALYST_VOICE = `Neutral, factual and analytical — you are reading data, not judging a person. Do not mock, praise or editorialise, and do not try to be funny. Never state a number that does not appear in the data above; when you describe a pattern, name the numbers it rests on. Where a sample is small, say so rather than drawing a conclusion from it. ${SHARED_LANGUAGE}`;

// The player's own row from every tracked match, joined to its match. Wider
// than the old 7-column version: role, gold, damage, vision and dead time are
// all already stored and none of them used to reach the prompt.
type HistoryParticipant = {
  id: string;
  player_id: string | null;
  team_id: number;
  team_position: string | null;
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  total_cs: number;
  gold_earned: number;
  damage_dealt_to_champions: number;
  vision_score: number | null;
  first_blood_kill: boolean | null;
  first_blood_assist: boolean | null;
};

type MatchWithParticipant = {
  id: string;
  game_creation: string;
  game_duration_seconds: number;
  match_participants: HistoryParticipant[];
};

type NoteRow = {
  note: string;
  created_at: string;
  match_participant_id: string;
  match_participants: { champion_id: number; champion_name: string } | null;
};

// The other nine rows of a game. MatchupInput is what lib/matchups.ts needs;
// the extra columns are for the lane opponent's own stat line and the team
// damage total, both of which are pure formatting of rows already fetched.
//
// Deliberately not printed for all ten participants. It would cost about
// 130 tokens a game, which is affordable, but for nine of the ten there is
// exactly one row in this database and nothing to aggregate it with — across
// this roster a given opponent is faced twice in roughly 2% of cases. Nine
// lines of strangers per game is attention spent on numbers that cannot
// generalise, and it invites the summary to explain losses by naming a
// teammate's score, which is unfalsifiable from a single row.
type LobbyParticipant = MatchupInput & {
  total_cs: number;
  gold_earned: number;
  damage_dealt_to_champions: number;
  vision_score: number | null;
};

// One game as the prompt sees it: the player's own row, plus the things that
// only exist once the other nine participants are loaded — who they were up
// against in lane and how that went, which of their friends were in the game,
// and how much of the team's damage was theirs.
type DetailedGame = {
  row: SignalRow;
  matchId: string;
  participantId: string;
  opponent: LobbyParticipant | null;
  clanmates: { name: string; championName: string; sameTeam: boolean }[];
  killParticipation: string | null;
  /** The player's share of their team's damage to champions, 0-100. */
  teamDamageShare: number | null;
  notes: string[];
};

export type SummaryResult = { summaryText: string; generatedAt: string } | { notEnoughData: true };

// Deliberately no wins/losses. players.wins/losses is recounted at sync time,
// so between a sync and the next one it can disagree with a count taken from
// the match rows right now — and this prompt tells the model never to state a
// number that isn't in it, then hands it two different overall records to
// choose from. The record printed below is counted from the same rows every
// other number here is derived from, so it cannot drift from them.
type PlayerRow = {
  display_name: string;
  tier: string | null;
  division: string | null;
  league_points: number | null;
};

/** Everything the prompt builder needs, already resolved and joined up. */
type PlayerPromptInput = {
  player: PlayerRow;
  playerId: string;
  signals: PlayerSignals;
  detailed: DetailedGame[];
  /** Notes on games older than the detailed window, so nothing is silently dropped. */
  olderNotes: { note: string; championName: string; playedAt: string | null }[];
  aiContext: AiContext;
};

export async function generatePlayerSummary(
  supabase: SupabaseClient,
  playerId: string,
  // Passed in when generating a whole batch, so the daily run loads the clan
  // and player context once instead of once per player.
  preloadedContext?: AiContext,
): Promise<SummaryResult> {
  const prompt = await buildPlayerSummaryPrompt(supabase, playerId, preloadedContext);
  if (prompt === null) return { notEnoughData: true };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const summaryText = await generateText(prompt, apiKey, {
    // Lower than the default: this prompt is asking for a reading of numbers,
    // and the creativity that makes the clan recap fun is what invents a
    // matchup winrate here.
    temperature: 0.4,
  });
  const generatedAt = new Date().toISOString();

  await supabase.from("player_ai_summaries").upsert(
    {
      player_id: playerId,
      summary_text: summaryText,
      generated_at: generatedAt,
      stale: false,
      force_regenerate: false,
    },
    { onConflict: "player_id" },
  );

  return { summaryText, generatedAt };
}

// Gathering the data and building the prompt is split from sending it so the
// prompt can be read without spending a request against a per-day quota.
// Returns null when there is nothing worth summarising.
export async function buildPlayerSummaryPrompt(
  supabase: SupabaseClient,
  playerId: string,
  preloadedContext?: AiContext,
): Promise<string | null> {
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("display_name, tier, division, league_points")
    .eq("id", playerId)
    .single();
  if (playerError || !player) throw new Error("Player not found.");

  const aiContext = preloadedContext ?? (await loadAiContext(supabase));

  // Query from matches (not match_participants) so game_creation is a true
  // top-level column — see the same fix/comment in player/[slug]/page.tsx.
  // Getting this right actually matters here: with the broken order a limit
  // applied through the embed caps in ~insertion order, not by recency,
  // silently feeding arbitrary history into the prompt.
  //
  // Unbounded on purpose, like the player page's own history query: the splits
  // in lib/player-signals.ts are computed over all of it. Only the first
  // DETAIL_MATCH_LIMIT rows are ever printed game-by-game.
  const [{ data: historyRaw }, { data: notes }, { data: roster }] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, game_creation, game_duration_seconds, match_participants!inner(id, player_id, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, total_cs, gold_earned, damage_dealt_to_champions, vision_score, first_blood_kill, first_blood_assist)",
      )
      .eq("match_participants.player_id", playerId)
      .order("game_creation", { ascending: false })
      .returns<MatchWithParticipant[]>(),
    supabase
      .from("match_notes")
      .select(
        "note, created_at, match_participant_id, match_participants!inner(champion_id, champion_name, player_id)",
      )
      .eq("match_participants.player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(MAX_NOTES)
      .returns<NoteRow[]>(),
    supabase.from("players").select("id, display_name"),
  ]);

  // championName stored on match_participants is Riot's internal codename
  // (e.g. "MonkeyKing" for Wukong), not the display name — resolve through
  // DDragon before this ever reaches the prompt. Same fix as the UI side.
  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);
  const resolveName = (championId: number, fallback: string) =>
    championDisplayName(championId, championMap, fallback);

  const history = (historyRaw ?? []).flatMap((m) => {
    const p = m.match_participants[0];
    if (!p) return [];
    return [
      {
        participantId: p.id,
        row: {
          match_id: m.id,
          game_creation: m.game_creation,
          game_duration_seconds: m.game_duration_seconds,
          player_id: p.player_id,
          team_id: p.team_id,
          team_position: p.team_position,
          champion_id: p.champion_id,
          champion_name: resolveName(p.champion_id, p.champion_name),
          win: p.win,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          total_cs: p.total_cs,
          gold_earned: p.gold_earned,
          damage_dealt_to_champions: p.damage_dealt_to_champions,
          vision_score: p.vision_score,
          first_blood_kill: p.first_blood_kill,
          first_blood_assist: p.first_blood_assist,
        } satisfies SignalRow,
      },
    ];
  });

  const noteRows = notes ?? [];
  if (history.length === 0 && noteRows.length === 0) {
    return null;
  }

  // Matchups and kill participation need the *enemy* and *ally* rows too, which
  // the filtered embed above can't return — it yields only the row matching
  // player_id. Second round trip, once the match ids are known, exactly as the
  // player page does it.
  const matchIds = history.map((h) => h.row.match_id);
  const { data: allParticipantsRaw } =
    matchIds.length > 0
      ? await supabase
          .from("match_participants")
          .select(
            "match_id, player_id, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, total_cs, gold_earned, damage_dealt_to_champions, vision_score",
          )
          .in("match_id", matchIds)
          .returns<LobbyParticipant[]>()
      : { data: [] as LobbyParticipant[] };

  const allParticipants = (allParticipantsRaw ?? []).map((p) => ({
    ...p,
    champion_name: resolveName(p.champion_id, p.champion_name),
  }));

  const signals = computePlayerSignals(
    history.map((h) => h.row),
    allParticipants,
    playerId,
  );

  const nameByPlayerId = new Map(
    (roster ?? []).map((p) => [p.id as string, p.display_name as string]),
  );

  const notesByParticipant = new Map<string, string[]>();
  for (const n of noteRows) {
    const list = notesByParticipant.get(n.match_participant_id) ?? [];
    list.push(n.note);
    notesByParticipant.set(n.match_participant_id, list);
  }

  const participantsByMatch = new Map<string, LobbyParticipant[]>();
  for (const p of allParticipants) {
    const list = participantsByMatch.get(p.match_id) ?? [];
    list.push(p);
    participantsByMatch.set(p.match_id, list);
  }

  const detailed: DetailedGame[] = history.slice(0, DETAIL_MATCH_LIMIT).map((h) => {
    const participants = participantsByMatch.get(h.row.match_id) ?? [];
    const team = participants.filter((p) => p.team_id === h.row.team_id);
    const teamKills = team.reduce((sum, p) => sum + p.kills, 0);
    const teamDamage = team.reduce((sum, p) => sum + p.damage_dealt_to_champions, 0);

    return {
      row: h.row,
      matchId: h.row.match_id,
      participantId: h.participantId,
      opponent: findLaneOpponent(participants, h.row),
      clanmates: participants
        .filter((p) => p.player_id && p.player_id !== playerId)
        .map((p) => ({
          name: nameByPlayerId.get(p.player_id as string) ?? "another tracked player",
          championName: p.champion_name,
          sameTeam: p.team_id === h.row.team_id,
        })),
      // A team with no kills has no denominator — leave it out rather than
      // printing 0%, which the model would read as the player doing nothing.
      killParticipation:
        teamKills > 0
          ? formatKillParticipation(h.row.kills, h.row.assists, teamKills)
          : null,
      teamDamageShare:
        teamDamage > 0 ? (h.row.damage_dealt_to_champions / teamDamage) * 100 : null,
      notes: notesByParticipant.get(h.participantId) ?? [],
    };
  });

  // Anything the group wrote about a game older than the window. Dropping these
  // would quietly lose the most deliberate input the app has.
  const detailedParticipantIds = new Set(detailed.map((d) => d.participantId));
  const playedAtByParticipant = new Map(
    history.map((h) => [h.participantId, h.row.game_creation]),
  );
  const olderNotes = noteRows
    .filter((n) => !detailedParticipantIds.has(n.match_participant_id))
    .map((n) => ({
      note: n.note,
      championName: n.match_participants
        ? resolveName(n.match_participants.champion_id, n.match_participants.champion_name)
        : "unknown champion",
      playedAt: playedAtByParticipant.get(n.match_participant_id) ?? null,
    }));

  return buildPlayerPrompt({ player, playerId, signals, detailed, olderNotes, aiContext });
}

// ------------------------------------------------------------
// Player prompt
// ------------------------------------------------------------

// Wall-clock in the roster's timezone, not UTC. A game at 22:40 in Buenos Aires
// is 01:40 UTC the next day, and printing that would hand the model a wrong
// answer to "did these losses happen on the same night" — the exact question
// the session split is there to support. Same zone the hour heatmap uses.
const GAME_TIME_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: ROSTER_TIME_ZONE,
  dateStyle: "short",
  timeStyle: "short",
});

const DATE_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: ROSTER_TIME_ZONE,
  dateStyle: "short",
});

function thousands(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

// Support CS is structurally low; leaving it off a support line stops the model
// reading a normal support game as a farming collapse. Same reasoning as
// csPerMinute's support exclusion in player-stats.ts.
function csClause(
  totalCs: number,
  teamPosition: string | null,
  gameDurationSeconds: number,
): string | null {
  if (isSupport(teamPosition)) return null;
  const perMinute = totalCs / Math.max(gameDurationSeconds / 60, 1);
  return `${totalCs} CS (${perMinute.toFixed(1)}/min)`;
}

// Every per-game field below this line is nullable — either from a row synced
// before migration 005 or from a patch where Riot stopped sending it. Printing
// a 0 for a missing value hands the model a fact that isn't true, and it will
// write a sentence about it. Missing fields are omitted from the line entirely.
function detailLine(game: DetailedGame): string {
  const { row, opponent } = game;

  const head = [
    GAME_TIME_FORMAT.format(new Date(row.game_creation)),
    row.win ? "WIN" : "LOSS",
    `${row.champion_name} (${formatRole(row.team_position)})${
      opponent ? ` vs ${opponent.champion_name}` : ""
    }`,
    formatDuration(row.game_duration_seconds),
  ];

  for (const mate of game.clanmates) {
    head.push(`${mate.sameTeam ? "duo with" : "against"} ${mate.name} (${mate.championName})`);
  }

  const stats: string[] = [`${row.kills}/${row.deaths}/${row.assists}`];
  if (game.killParticipation) stats.push(`KP ${game.killParticipation}`);
  const cs = csClause(row.total_cs, row.team_position, row.game_duration_seconds);
  if (cs) stats.push(cs);
  // Damage share separates "did nothing" from "carried a team that lost", which
  // a raw damage number can't: 20k is a poor game in a 40-minute slugfest and a
  // good one in a 22-minute stomp.
  stats.push(
    `${thousands(row.damage_dealt_to_champions)} dmg${
      game.teamDamageShare === null ? "" : ` (${pct(game.teamDamageShare)} of the team's)`
    }`,
  );
  stats.push(`${thousands(row.gold_earned)} gold`);
  if (typeof row.vision_score === "number") stats.push(`vision ${row.vision_score}`);
  if (row.first_blood_kill) stats.push("got first blood");

  const lines = [`- ${head.join(" | ")}`, `  ${stats.join(" | ")}`];

  // The enemy laner's own line in the same game. Without it a 8/9/4 is
  // ambiguous between losing lane and being on a losing team, which is the
  // single most useful distinction the stored data can still make — and it
  // costs about 13 tokens a game, since these rows are already loaded for the
  // matchup aggregates.
  if (opponent) {
    const theirs: string[] = [`${opponent.kills}/${opponent.deaths}/${opponent.assists}`];
    const theirCs = csClause(
      opponent.total_cs,
      opponent.team_position,
      row.game_duration_seconds,
    );
    if (theirCs) theirs.push(theirCs);
    theirs.push(`${thousands(opponent.damage_dealt_to_champions)} dmg`);
    theirs.push(`${thousands(opponent.gold_earned)} gold`);
    if (typeof opponent.vision_score === "number") theirs.push(`vision ${opponent.vision_score}`);
    lines.push(`  lane opponent ${opponent.champion_name}: ${theirs.join(" | ")}`);
  }

  for (const note of game.notes) {
    lines.push(`  note: "${note}"`);
  }
  return lines.join("\n");
}

// Recent form against the player's own baseline. Only emitted once there are
// genuinely more games than the window — computeTrend returns a null delta
// otherwise, because comparing the last 10 against a history that *is* those
// same 10 games is a comparison to itself.
function trendBlock(signals: PlayerSignals): string {
  const { recent, lifetime, delta } = signals.trend;
  if (!delta) {
    return `Only ${lifetime.games} recorded games — not enough history to compare recent form against a baseline yet.`;
  }

  const rows: string[] = [
    `- winrate: ${pct(playerWinRate(recent))} vs ${pct(playerWinRate(lifetime))}`,
    `- KDA: ${kdaRatio(recent).toFixed(2)} vs ${kdaRatio(lifetime).toFixed(2)}`,
    `- deaths per game: ${deathsPerGame(recent).toFixed(1)} vs ${deathsPerGame(lifetime).toFixed(1)}`,
    `- damage per minute: ${Math.round(damagePerMinute(recent))} vs ${Math.round(damagePerMinute(lifetime))}`,
  ];
  if (recent.csGames > 0 && lifetime.csGames > 0) {
    rows.push(
      `- CS per minute (non-support games only): ${csPerMinute(recent).toFixed(1)} vs ${csPerMinute(lifetime).toFixed(1)}`,
    );
  }
  // detailGames is the marker for "this row was synced with full detail". A
  // half-backfilled history reports over what it actually has, rather than
  // averaging real numbers against nulls.
  if (recent.detailGames > 0 && lifetime.detailGames > 0) {
    rows.push(
      `- vision score per minute: ${visionScorePerMinute(recent).toFixed(2)} vs ${visionScorePerMinute(lifetime).toFixed(2)}`,
    );
  }

  return [
    `Last ${TREND_WINDOW} games vs all ${lifetime.games} recorded games (the all-games figure includes those ${TREND_WINDOW}, so treat small gaps as noise):`,
    ...rows,
  ].join("\n");
}

// The ten per-index points collapse into three buckets. Ten lines of two-game
// samples is noise the model would happily narrate; "does this player fall off
// late in a session" is the question actually being asked.
function sessionBlock(signals: PlayerSignals): string {
  const buckets: { label: string; games: number; wins: number }[] = [
    { label: "games 1-2 of a session", games: 0, wins: 0 },
    { label: "games 3-4 of a session", games: 0, wins: 0 },
    { label: "games 5 and later", games: 0, wins: 0 },
  ];

  for (const point of signals.sessionCurve) {
    const bucket = point.index <= 2 ? buckets[0] : point.index <= 4 ? buckets[1] : buckets[2];
    bucket.games += point.games;
    bucket.wins += point.wins;
  }

  // Same floor as every other split. The tail bucket is the one that needs it:
  // long sessions are rare, so it routinely lands on a single game, and a lone
  // win printed as "100%" is precisely the kind of line a model builds a
  // paragraph about people tilting on.
  const lines = buckets
    .filter((b) => b.games >= MIN_SPLIT_GAMES)
    .map(
      (b) =>
        `- ${b.label}: ${pct((b.wins / b.games) * 100)} (${b.games} games, ${b.wins}W ${b.games - b.wins}L)`,
    );

  return lines.length > 0 ? lines.join("\n") : "Not enough games to split by session position.";
}

function buildPlayerPrompt({
  player,
  playerId,
  signals,
  detailed,
  olderNotes,
  aiContext,
}: PlayerPromptInput): string {
  // Counted from the same rows as every split below — see the note on PlayerRow.
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

  // The KDA here is the player's own in that matchup, not the opponent's — it
  // was already being accumulated and thrown away. Winrate alone can't separate
  // "this champion beats me" from "I go even and the game is lost elsewhere".
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
      ? `Currently on a ${Math.abs(streak)}-game ${streak > 0 ? "win" : "loss"} streak. Longest ever: ${signals.streak.longestWin}W / ${signals.streak.longestLoss}L.`
      : `No notable streak right now (last result: ${streak > 0 ? "a win" : "a loss"}). Longest ever: ${signals.streak.longestWin}W / ${signals.streak.longestLoss}L.`;

  const { gameLength } = signals;
  const gameLengthLine =
    gameLength.winGames > 0 && gameLength.lossGames > 0
      ? `Average game length: ${formatDuration(Math.round(gameLength.winAvgSeconds))} in wins (${gameLength.winGames} games) vs ${formatDuration(Math.round(gameLength.lossAvgSeconds))} in losses (${gameLength.lossGames} games).`
      : "";

  const firstBloodLine = signals.firstBlood
    ? `First blood involvement: ${signals.firstBlood.involved} of the ${signals.firstBlood.reportedGames} games that reported it.`
    : "";

  const kpLine = signals.killParticipation
    ? `Average kill participation: ${pct(signals.killParticipation.average * 100)} (over ${signals.killParticipation.reportedGames} games).`
    : "";

  const olderNoteLines = olderNotes
    .map(
      (n) =>
        `- ${n.playedAt ? DATE_FORMAT.format(new Date(n.playedAt)) : "date unknown"}, on ${n.championName}: "${n.note}"`,
    )
    .join("\n");

  return `You are analysing one player's form for a friend group's private League of Legends ranked tracker. The player is "${player.display_name}".

${playerContextLine(aiContext, playerId, "analyst")}Current rank: ${formatRank(player.tier, player.division)}${player.tier ? ` (${player.league_points ?? 0} LP)` : ""}
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
${matchupLines || "No lane opponent has been faced enough times yet."}${
    signals.worstMatchup
      ? `\nWorst matchup by losses: ${signals.worstMatchup.championName}, ${pct(matchupWinRate(signals.worstMatchup))} over ${signals.worstMatchup.games} games.`
      : ""
  }

WINRATE BY POSITION IN A QUEUE SESSION
A "session" is consecutive games with no long break between them, so this is
how the player holds up as a night goes on.
${sessionBlock(signals)}

OTHER
${[gameLengthLine, firstBloodLine, kpLine].filter(Boolean).join("\n") || "No further splits available."}

======================================================================
THE LAST ${detailed.length} GAMES, newest first.
Fields that this patch or this row did not record are left out entirely —
a missing field means unknown, never zero. A line marked "note" is what the
player themselves wrote about that game afterwards, in their own words.
======================================================================

${detailed.map(detailLine).join("\n") || "No recent games recorded."}

======================================================================
NOTES ON OLDER GAMES
Notes on the games above appear inline with their game. These are the rest,
from games too old to be listed individually.
======================================================================

${olderNoteLines || "No notes on older games."}

Write an objective analysis of how this player is performing. Cover three things: how their current form compares to their own baseline, any concrete patterns visible across these games (champions, roles, lane matchups, how deep into a session they are, game length, who they queue with), and whether their own notes line up with what the data shows. Two or three short paragraphs, separated by a blank line. If the data does not support a pattern, say there isn't one rather than inventing one. ${ANALYST_VOICE}`;
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

Write a 4-6 sentence recap of how the group is doing. Single out whoever deserves it, good or bad, and mention the duos or head-to-heads if there's anything worth saying about them. Do not just list everyone's record one by one — say something about the group. ${RECAP_VOICE}`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const summaryText = await generateText(prompt, apiKey);
  const generatedAt = new Date().toISOString();

  await supabase
    .from("team_ai_summary")
    .upsert(
      {
        id: 1,
        summary_text: summaryText,
        generated_at: generatedAt,
        stale: false,
        force_regenerate: false,
      },
      { onConflict: "id" },
    );

  return { summaryText, generatedAt };
}
