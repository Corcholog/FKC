import Link from "next/link";
import { Users, Swords, BarChart3, LineChart, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { maybeRow, optional, rows } from "@/lib/supabase/read";
import { getSession } from "@/lib/auth";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { formatRelativeTime, formatKdaRatio, isoDaysAgo } from "@/lib/format";
import { notesByParticipant } from "@/lib/match-notes";
import { privateSource } from "@/lib/data-source";
import {
  groupParticipantsByMatch,
  loadMatchRowParticipants,
  matchComposition,
} from "@/lib/match-rows";
import { rankSortKey, formatWinRate } from "@/lib/rank";
import {
  aggregateMainRoleStats,
  aggregatePlayerStats,
  csPerMinute,
  damagePerMinute,
  deadTimeShare,
  deathsPerGame,
  kdaRatio,
  minutesSpentDead,
  missingPingsPerGame,
  playerWinRate,
  rankPlayers,
  visionScorePerMinute,
  type PlayerAgg,
  type PlayerStatInput,
  type Ranked,
} from "@/lib/player-stats";
import { streaksByPlayer, formatStreak, NOTABLE_STREAK } from "@/lib/streaks";
import { MatchRow } from "@/components/match-row";
import { AwardTile } from "@/components/award-tile";
import { TeamSummaryCard } from "@/components/team-summary-card";
import { RankBadge } from "@/components/rank-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ACTIVITY_MATCH_LIMIT = 15;
const ACTIVITY_FEED_LIMIT = 10;

type PlayerRow = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  tier: string | null;
  division: string | null;
  league_points: number | null;
  wins: number | null;
  losses: number | null;
};

type MatchListRow = {
  id: string;
  riot_match_id: string;
  game_creation: string;
  game_duration_seconds: number;
};


// game_duration_seconds and game_creation live on matches, so they arrive
// nested and get flattened onto the row before aggregation — same as /team and
// /champions.
type AwardStatRow = Omit<PlayerStatInput, "game_duration_seconds"> & {
  matches: { game_duration_seconds: number; game_creation: string } | null;
};

function QuickLinkRow({ href, icon: Icon, label }: { href: string; icon: typeof Users; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-white transition-colors hover:bg-bg-tertiary"
    >
      <Icon className="h-4 w-4 shrink-0 text-gold" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-grey-mid" />
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const weekAgoIso = isoDaysAgo(7);

  // These are independent of each other — run them concurrently instead of
  // paying for a sequential round trip each.
  const [
    playersResult,
    syncStateResult,
    teamSummaryResult,
    weekRowsResult,
    matchListResult,
    awardRows,
    version,
  ] = await Promise.all([
      supabase
        .from("players")
        .select("id, slug, display_name, avatar_url, tier, division, league_points, wins, losses")
        .returns<PlayerRow[]>(),
      supabase
        .from("sync_state")
        .select("riot_key_valid, last_sync_status, last_sync_finished_at")
        .eq("id", 1)
        .single(),
      supabase
        .from("team_ai_summary")
        .select("summary_text, generated_at")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("match_participants")
        .select("player_id, matches!inner(game_creation)")
        .not("player_id", "is", null)
        .gte("matches.game_creation", weekAgoIso)
        .returns<{ player_id: string }[]>(),
      // Query from matches (true top-level order, proven safe) rather than
      // ordering "through" an embedded match_participants collection.
      supabase
        .from("matches")
        .select("id, riot_match_id, game_creation, game_duration_seconds, match_participants!inner(player_id)")
        .not("match_participants.player_id", "is", null)
        .order("game_creation", { ascending: false })
        .limit(ACTIVITY_MATCH_LIMIT)
        .returns<MatchListRow[]>(),
      // Every tracked player's full history, for the award tiles and streaks
      // below. Paged rather than a bare select: this is the whole roster's
      // history in one read, so it's the largest query on the site and the one
      // where a silent Max rows truncation would quietly rewrite who holds
      // every award. Same treatment on /team, /champions and /insights.
      //
      // team_position comes back for two reasons: the performance awards are
      // scoped to each player's main role, and CS/min drops support games — see
      // aggregateMainRoleStats.
      //
      // The columns after damage_dealt_to_champions arrive with migration 005
      // and are null on anything synced before it — see accumulate, which counts
      // them separately so a half-backfilled history isn't averaged over zeroes.
      fetchAllRows<AwardStatRow>((from, to) =>
        supabase
          .from("match_participants")
          .select(
            "player_id, team_position, win, kills, deaths, assists, total_cs, damage_dealt_to_champions, vision_score, total_time_spent_dead, penta_kills, objectives_stolen, total_damage_taken, pings, first_blood_kill, matches!inner(game_duration_seconds, game_creation)",
          )
          .not("player_id", "is", null)
          .range(from, to)
          .returns<AwardStatRow[]>(),
      ),
      getLatestVersion(),
    ]);

  // The roster is the page: every tile, ranking and match row below is keyed by
  // player. A failed read here used to render the whole dashboard blank, which
  // is indistinguishable from a roster nobody has filled in yet.
  const players = rows(playersResult, "roster");
  const weekRows = rows(weekRowsResult, "this week's games");
  const matchListFull = rows(matchListResult, "recent matches");
  const teamSummary = maybeRow(teamSummaryResult, "team recap");
  // Chrome, not content — a missing sync banner is not worth losing the page for.
  const syncState = optional(syncStateResult, "sync state", null);

  const playersById = new Map(players.map((p) => [p.id, p]));
  const rosterSorted = [...players].sort((a, b) => rankSortKey(a) - rankSortKey(b));

  const totalWins = players.reduce((sum, p) => sum + (p.wins ?? 0), 0);
  const totalLosses = players.reduce((sum, p) => sum + (p.losses ?? 0), 0);
  const totalGames = totalWins + totalLosses;
  const groupWinRate = totalGames === 0 ? null : Math.round((totalWins / totalGames) * 100);

  const gamesThisWeek = weekRows.length;
  const weeklyCountByPlayer = new Map<string, number>();
  for (const row of weekRows) {
    weeklyCountByPlayer.set(row.player_id, (weeklyCountByPlayer.get(row.player_id) ?? 0) + 1);
  }
  let mostActivePlayer: PlayerRow | null = null;
  let mostActiveCount = 0;
  for (const [playerId, count] of weeklyCountByPlayer) {
    if (count > mostActiveCount) {
      mostActiveCount = count;
      mostActivePlayer = playersById.get(playerId) ?? null;
    }
  }

  const flatAwardRows = awardRows.map((r) => ({
    ...r,
    game_duration_seconds: r.matches?.game_duration_seconds ?? 0,
  }));
  // Two aggregates, because the tiles below split into two kinds of award.
  //
  // Performance metrics — anything derived from kills, deaths, assists, CS,
  // vision or damage — read `mainRoleStats`, which counts only the role a player
  // actually queues for. An autofilled support carries a CS/min and a vision
  // score from a role they don't play, and folding those in means the tile ranks
  // who got autofilled rather than who farms or wards well.
  //
  // Counting awards — pentakills, steals, first bloods, games, pings, time dead —
  // read `allStats`. Those measure what happened over a career, and a pentakill
  // off-role is still a pentakill; scoping them would just hide games.
  const mainRoleStats = aggregateMainRoleStats(flatAwardRows);
  const allStats = aggregatePlayerStats(flatAwardRows);
  const streaks = streaksByPlayer(
    awardRows.map((r) => ({
      player_id: r.player_id,
      win: r.win,
      game_creation: r.matches?.game_creation ?? "",
    })),
  );

  const roster = players ?? [];

  // `qualifier` picks which game counter gates the award, so a metric that only
  // exists on fully-synced rows isn't handed to a player whose history predates
  // migration 005 — see PlayerAgg.detailGames.
  //
  // Returns the whole standings rather than just the winner: the tile shows
  // entry zero and hands the rest to the dialog behind it.
  const ranking = (
    stats: Map<string, PlayerAgg>,
    score: (agg: PlayerAgg) => number,
    direction: "max" | "min",
    qualifier: (agg: PlayerAgg) => number = (agg) => agg.games,
  ) => rankPlayers(roster, stats, (p) => p.id, score, qualifier, direction);

  /** A performance stat, over the player's main role only. */
  const award = (
    score: (agg: PlayerAgg) => number,
    direction: "max" | "min",
    qualifier?: (agg: PlayerAgg) => number,
  ) => ranking(mainRoleStats, score, direction, qualifier);

  /** A career counter, over every tracked game whatever role it was played in. */
  const careerAward = (
    score: (agg: PlayerAgg) => number,
    direction: "max" | "min",
    qualifier?: (agg: PlayerAgg) => number,
  ) => ranking(allStats, score, direction, qualifier);

  const csGames = (agg: PlayerAgg) => agg.csGames;
  const detailGames = (agg: PlayerAgg) => agg.detailGames;

  // Sub-text doubles as the honesty check on each tile: with no minimum-games
  // gate, a leader off two games should be visibly a leader off two games.
  const gamesSub = (games: number) => `${games} game${games === 1 ? "" : "s"}`;
  // Says so on the tile, because the two kinds of award sit side by side and
  // otherwise "Best KDA · 12 games" next to "Most games · 40" reads as a bug.
  const mainRoleSub = (games: number) => `${games} main-role game${games === 1 ? "" : "s"}`;
  // Migration 005 columns only exist on games synced since it ran, so these
  // tiles say how many games they're actually built on rather than implying the
  // full history.
  const detailSub = (games: number) => `${gamesSub(games)} with full detail`;
  const mainRoleDetailSub = (games: number) => `${mainRoleSub(games)} with full detail`;

  const oneDecimal = (v: number) => v.toFixed(1);

  type AwardSpec = {
    label: string;
    tone: "good" | "bad" | "neutral";
    /** Everyone who qualifies, best-first. The tile shows [0]; the dialog shows all of it. */
    ranking: Ranked<PlayerRow>[];
    format: (value: number) => string;
    sub: (games: number) => string;
    /**
     * What the number actually measures, in one line. A tile label like "Ward
     * god" is a joke, not a definition — the standings dialog is where the
     * metric gets stated plainly enough to argue with.
     */
    metric: string;
    /** Reads a migration-005 column, so it only has an answer once that data exists. */
    detail?: boolean;
  };

  // Whether the roster has any migration-005 data at all. Until the settings
  // backfill has run, the tiles built on it would all be em dashes, so they're
  // dropped from their section rather than padding it out — see `visible` below.
  const hasDetailedStats = [...allStats.values()].some((agg) => agg.detailGames > 0);
  const visible = (specs: AwardSpec[]) => specs.filter((spec) => hasDetailedStats || !spec.detail);

  const hallOfFame: AwardSpec[] = visible([
    {
      label: "Best KDA",
      tone: "good",
      ranking: award(kdaRatio, "max"),
      format: formatKdaRatio,
      sub: mainRoleSub,
      metric: "(Kills + assists) ÷ deaths, over the player's main role only. Highest first.",
    },
    {
      label: "Best CS/min",
      tone: "good",
      ranking: award(csPerMinute, "max", csGames),
      format: oneDecimal,
      sub: mainRoleSub,
      metric: "Creep score per minute in the player's main role. Support mains sit this one out. Highest first.",
    },
    {
      label: "Highest winrate",
      tone: "good",
      ranking: award(playerWinRate, "max"),
      format: (v) => `${v}%`,
      sub: mainRoleSub,
      metric:
        "Main-role games won ÷ main-role games played. No minimum — read the game count beside it. Highest first.",
    },
    {
      label: "Best damage/min",
      tone: "good",
      ranking: award(damagePerMinute, "max"),
      // Four-digit figure in a headline font — a tenth of a damage point is noise.
      format: (v) => Math.round(v).toLocaleString("en-US"),
      sub: mainRoleSub,
      metric: "Damage to champions per minute played, in the player's main role. Highest first.",
    },
    {
      label: "Ward god",
      tone: "good",
      ranking: award(visionScorePerMinute, "max", detailGames),
      // Two decimals, not one: the whole roster lands between roughly 0.5 and
      // 3.0, so a single decimal would tie half of it together.
      format: (v) => v.toFixed(2),
      sub: mainRoleDetailSub,
      metric:
        "Vision score per minute in the player's main role — wards placed, wards killed, time held. A rate, so a long game doesn't win it on its own. Highest first.",
      detail: true,
    },
    {
      label: "Objective thief",
      tone: "good",
      ranking: careerAward((a) => a.objectivesStolen, "max", detailGames),
      format: (v) => String(v),
      sub: detailSub,
      metric: "Dragons, barons and heralds stolen, all-time total across every role. Most first.",
      detail: true,
    },
    {
      label: "Pentakills",
      tone: "good",
      ranking: careerAward((a) => a.pentaKills, "max", detailGames),
      format: (v) => String(v),
      sub: detailSub,
      metric: "Pentakills, all-time total across every role. Most first.",
      detail: true,
    },
    {
      label: "Most first bloods",
      tone: "good",
      ranking: careerAward((a) => a.firstBloods, "max", detailGames),
      format: (v) => String(v),
      sub: detailSub,
      metric: "First blood kills, all-time total across every role. Most first.",
      detail: true,
    },
    {
      // Not a good or a bad stat, just a lot of one — neutral tone keeps it from
      // reading as an achievement it isn't.
      label: "Most games",
      tone: "neutral",
      ranking: careerAward((a) => a.games, "max"),
      format: (v) => String(v),
      sub: gamesSub,
      metric: "Tracked games played, every role included. Most first.",
    },
  ]);

  const hallOfShame: AwardSpec[] = visible([
    {
      label: "Worst KDA",
      tone: "bad",
      ranking: award(kdaRatio, "min"),
      format: formatKdaRatio,
      sub: mainRoleSub,
      metric: "(Kills + assists) ÷ deaths, over the player's main role only. Lowest first.",
    },
    {
      label: "Worst CS/min",
      tone: "bad",
      ranking: award(csPerMinute, "min", csGames),
      format: oneDecimal,
      sub: mainRoleSub,
      metric: "Creep score per minute in the player's main role. Support mains sit this one out. Lowest first.",
    },
    {
      label: "Most deaths/game",
      tone: "bad",
      ranking: award(deathsPerGame, "max"),
      format: oneDecimal,
      sub: mainRoleSub,
      metric: "Deaths per game in the player's main role. Most first.",
    },
    {
      label: "Time spent dead",
      tone: "bad",
      ranking: careerAward(minutesSpentDead, "max", detailGames),
      format: (v) => `${Math.round(v)}m`,
      sub: detailSub,
      metric:
        "Total minutes on the grey screen, all-time across every role. Most first — playing more will win this.",
      detail: true,
    },
    {
      // The fair version of the tile beside it — playing the most games would
      // otherwise win the raw total by default.
      label: "% of game dead",
      tone: "bad",
      ranking: careerAward(deadTimeShare, "max", detailGames),
      format: (v) => `${v.toFixed(1)}%`,
      sub: detailSub,
      metric:
        "Share of total game time spent dead, every role included. The version of the tile beside it that game count can't win. Most first.",
      detail: true,
    },
    {
      label: "Most ? pings",
      tone: "neutral",
      ranking: careerAward(missingPingsPerGame, "max", detailGames),
      format: oneDecimal,
      sub: (games) => `per game · ${detailSub(games)}`,
      metric: "Enemy-missing pings per game, every role included. Most first.",
      detail: true,
    },
  ]);

  const matchList = matchListFull;
  const matchIds = matchList.map((m) => m.id);
  const [allParticipants, championMap] = await Promise.all([
    loadMatchRowParticipants(privateSource(supabase), matchIds),
    getChampionMap(version),
  ]);

  const participantsByMatch = groupParticipantsByMatch(allParticipants);

  const activityEntries = matchList.flatMap((m) => {
    const participants = participantsByMatch.get(m.id) ?? [];
    const trackedViewers = participants.filter((p) => p.player_id);

    return trackedViewers.map((viewer) => ({
      match: m,
      viewer,
      ...matchComposition(participants, viewer),
      player: playersById.get(viewer.player_id as string),
    }));
  });
  const recentActivity = activityEntries.slice(0, ACTIVITY_FEED_LIMIT);

  // Notes for exactly the rows about to render — the sliced feed, not every
  // entry the activity query produced. Eager rather than fetched on expand, so
  // a collapsed row can show its note count.
  const [notesByParticipantId, session] = await Promise.all([
    notesByParticipant(supabase, recentActivity.map((e) => e.viewer.id)),
    getSession(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-grey-light">Fake Clan at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <div className="grid grid-cols-3 gap-3">
            <Card className="panel-hex panel-hex-clip py-5">
              <CardContent className="flex flex-col items-center gap-1 text-center">
                <p className="font-heading tabular-nums text-3xl font-semibold text-white">{gamesThisWeek}</p>
                <p className="text-xs text-grey-light">Games this week</p>
              </CardContent>
            </Card>
            <Card className="panel-hex panel-hex-clip py-5">
              <CardContent className="flex flex-col items-center gap-1 text-center">
                <p className="font-heading tabular-nums text-3xl font-semibold text-white">
                  {groupWinRate === null ? "—" : `${groupWinRate}%`}
                </p>
                <p className="text-xs text-grey-light">Team winrate</p>
              </CardContent>
            </Card>
            <Card className="panel-hex panel-hex-clip py-5">
              <CardContent className="flex flex-col items-center gap-1 text-center">
                <p className="truncate font-heading text-3xl font-semibold text-white">
                  {mostActivePlayer ? mostActivePlayer.display_name : "—"}
                </p>
                <p className="text-xs text-grey-light">
                  {mostActivePlayer ? `Most active (${mostActiveCount} this week)` : "No games this week"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Both halls share a column count so the tiles line up as one block
              across the two headings, even when they hold different counts. */}
          {[
            { heading: "Hall of fame", specs: hallOfFame },
            { heading: "Hall of shame", specs: hallOfShame },
          ].map(({ heading, specs }) => (
            <section key={heading} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">{heading}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {specs.map(({ label, tone, ranking, format, sub, metric }) => {
                  const leader = ranking[0] ?? null;

                  return (
                    <AwardTile
                      key={label}
                      label={label}
                      tone={tone}
                      player={leader?.player ?? null}
                      value={leader ? format(leader.value) : ""}
                      sub={leader ? sub(leader.games) : undefined}
                      metric={metric}
                      ranking={ranking.map(({ player, value, games }) => ({
                        id: player.id,
                        name: player.display_name,
                        avatarUrl: player.avatar_url,
                        href: `/player/${player.slug}`,
                        value: format(value),
                        sub: sub(games),
                      }))}
                    />
                  );
                })}
              </div>
            </section>
          ))}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">Recent activity</h2>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-grey-mid">No tracked matches yet.</p>
            ) : (
              recentActivity.map(({ match, viewer, opponent, allies, enemies, player }) => (
                <MatchRow
                  key={viewer.id}
                  match={{
                    riotMatchId: match.riot_match_id,
                    championId: viewer.champion_id,
                    championName: viewer.champion_name,
                    win: viewer.win,
                    kills: viewer.kills,
                    deaths: viewer.deaths,
                    assists: viewer.assists,
                    damageDealtToChampions: viewer.damage_dealt_to_champions,
                    totalCs: viewer.total_cs,
                    teamPosition: viewer.team_position,
                    visionScore: viewer.vision_score,
                    gameCreation: match.game_creation,
                    gameDurationSeconds: match.game_duration_seconds,
                    opponent,
                    allies,
                    enemies,
                  }}
                  version={version}
                  championMap={championMap}
                  notes={{
                    participantId: viewer.id,
                    playerId: viewer.player_id as string,
                    ownerName: player?.display_name ?? "This player",
                    items: notesByParticipantId.get(viewer.id) ?? [],
                    canAdd: session?.player?.id === viewer.player_id,
                    currentUserId: session?.user.id ?? null,
                  }}
                  playerName={player?.display_name}
                />
              ))
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xs tracking-wide text-grey-light uppercase">Browse</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0.5">
              <QuickLinkRow href="/team" icon={Users} label="Team" />
              <QuickLinkRow href="/matches" icon={Swords} label="Matches" />
              <QuickLinkRow href="/champions" icon={BarChart3} label="Champions" />
              <QuickLinkRow href="/insights" icon={LineChart} label="Insights" />
            </CardContent>
          </Card>

          {syncState && (
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-xs tracking-wide text-grey-light uppercase">
                  Sync status
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <Badge
                  variant="outline"
                  className={
                    syncState.riot_key_valid
                      ? "self-start border-win/40 text-win"
                      : "self-start border-warning/40 text-warning"
                  }
                >
                  {syncState.riot_key_valid ? "Riot key valid" : "Riot key invalid/expired"}
                </Badge>
                <span className="text-grey-light">
                  {syncState.last_sync_finished_at
                    ? `Last sync ${formatRelativeTime(syncState.last_sync_finished_at)}`
                    : "Never synced yet"}
                </span>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xs tracking-wide text-grey-light uppercase">Squad</CardTitle>
              <CardAction>
                <Link href="/team" className="text-xs text-gold-bright hover:underline">
                  View team →
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-0.5">
              {rosterSorted.length === 0 ? (
                <p className="text-sm text-grey-mid">No players tracked yet.</p>
              ) : (
                rosterSorted.map((p) => {
                  const streak = streaks.get(p.id);
                  const streakLabel = streak ? formatStreak(streak) : null;
                  const onFire = (streak?.current ?? 0) >= NOTABLE_STREAK;

                  return (
                    <Link
                      key={p.id}
                      href={`/player/${p.slug}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-tertiary"
                    >
                      <Avatar size="sm">
                        {p.avatar_url && <AvatarImage src={p.avatar_url} alt="" />}
                        <AvatarFallback className="text-[10px]">
                          {p.display_name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <p className="min-w-0 flex-1 truncate text-sm text-white">{p.display_name}</p>
                      {/* Only rendered once a streak is long enough to be worth
                          mentioning — see NOTABLE_STREAK. */}
                      {streakLabel && (
                        <span
                          title={streakLabel}
                          className={`shrink-0 text-xs ${onFire ? "text-win" : "text-loss"}`}
                        >
                          {onFire ? "🔥" : "😈"}
                        </span>
                      )}
                      <RankBadge tier={p.tier} division={p.division} size="sm" />
                      <span className="shrink-0 text-xs tabular-nums text-grey-light">
                        {formatWinRate(p.wins, p.losses)}
                      </span>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>

          <TeamSummaryCard
            summary={(teamSummary?.summary_text as string | null) ?? null}
            generatedAt={(teamSummary?.generated_at as string | null) ?? null}
          />
        </div>
      </div>
    </main>
  );
}
