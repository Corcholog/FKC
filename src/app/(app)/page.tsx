import Link from "next/link";
import { Users, Swords, BarChart3, LineChart, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { formatRelativeTime, formatKdaRatio, isoDaysAgo } from "@/lib/format";
import { findLaneOpponent, sortByRole } from "@/lib/roles";
import { rankSortKey, formatWinRate } from "@/lib/rank";
import {
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
import { MatchRow, type TeamComposChampion } from "@/components/match-row";
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

type ParticipantRow = {
  id: string;
  match_id: string;
  player_id: string | null;
  team_id: number;
  team_position: string | null;
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damage_dealt_to_champions: number;
  total_cs: number;
  /** Null on games synced before migration 005. */
  vision_score: number | null;
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
    { data: players },
    { data: syncState },
    { data: teamSummary },
    { data: weekRows },
    { data: matchListFull },
    { data: awardRows },
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
      // below. Same unbounded-select shape as /team and /champions.
      //
      // The columns after damage_dealt_to_champions arrive with migration 005
      // and are null on anything synced before it — see aggregatePlayerStats,
      // which counts them separately so a half-backfilled history isn't
      // averaged over zeroes.
      supabase
        .from("match_participants")
        .select(
          "player_id, team_position, win, kills, deaths, assists, total_cs, damage_dealt_to_champions, vision_score, total_time_spent_dead, penta_kills, objectives_stolen, total_damage_taken, pings, matches!inner(game_duration_seconds, game_creation)",
        )
        .not("player_id", "is", null)
        .returns<AwardStatRow[]>(),
      getLatestVersion(),
    ]);

  const playersById = new Map((players ?? []).map((p) => [p.id, p]));
  const rosterSorted = [...(players ?? [])].sort((a, b) => rankSortKey(a) - rankSortKey(b));

  const totalWins = (players ?? []).reduce((sum, p) => sum + (p.wins ?? 0), 0);
  const totalLosses = (players ?? []).reduce((sum, p) => sum + (p.losses ?? 0), 0);
  const totalGames = totalWins + totalLosses;
  const groupWinRate = totalGames === 0 ? null : Math.round((totalWins / totalGames) * 100);

  const gamesThisWeek = weekRows?.length ?? 0;
  const weeklyCountByPlayer = new Map<string, number>();
  for (const row of weekRows ?? []) {
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

  const flatAwardRows = (awardRows ?? []).map((r) => ({
    ...r,
    game_duration_seconds: r.matches?.game_duration_seconds ?? 0,
  }));
  const awardStats = aggregatePlayerStats(flatAwardRows);
  const streaks = streaksByPlayer(
    (awardRows ?? []).map((r) => ({
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
  const award = (
    score: (agg: PlayerAgg) => number,
    direction: "max" | "min",
    qualifier: (agg: PlayerAgg) => number = (agg) => agg.games,
  ) => rankPlayers(roster, awardStats, (p) => p.id, score, qualifier, direction);

  const csGames = (agg: PlayerAgg) => agg.csGames;
  const detailGames = (agg: PlayerAgg) => agg.detailGames;

  // Sub-text doubles as the honesty check on each tile: with no minimum-games
  // gate, a leader off two games should be visibly a leader off two games.
  const gamesSub = (games: number) => `${games} game${games === 1 ? "" : "s"}`;
  const csSub = (games: number) => `${gamesSub(games)} · excl. support`;
  // Migration 005 columns only exist on games synced since it ran, so these
  // tiles say how many games they're actually built on rather than implying the
  // full history.
  const detailSub = (games: number) => `${gamesSub(games)} with full detail`;

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
  const hasDetailedStats = [...awardStats.values()].some((agg) => agg.detailGames > 0);
  const visible = (specs: AwardSpec[]) => specs.filter((spec) => hasDetailedStats || !spec.detail);

  const hallOfFame: AwardSpec[] = visible([
    {
      label: "Best KDA",
      tone: "good",
      ranking: award(kdaRatio, "max"),
      format: formatKdaRatio,
      sub: gamesSub,
      metric: "(Kills + assists) ÷ deaths, over every tracked game. Highest first.",
    },
    {
      label: "Best CS/min",
      tone: "good",
      ranking: award(csPerMinute, "max", csGames),
      format: oneDecimal,
      sub: csSub,
      metric: "Creep score per minute. Support games are excluded on both sides. Highest first.",
    },
    {
      label: "Highest winrate",
      tone: "good",
      ranking: award(playerWinRate, "max"),
      format: (v) => `${v}%`,
      sub: gamesSub,
      metric: "Games won ÷ games played. No minimum — read the game count beside it. Highest first.",
    },
    {
      label: "Best damage/min",
      tone: "good",
      ranking: award(damagePerMinute, "max"),
      // Four-digit figure in a headline font — a tenth of a damage point is noise.
      format: (v) => Math.round(v).toLocaleString("en-US"),
      sub: gamesSub,
      metric: "Damage to champions per minute played. Highest first.",
    },
    {
      label: "Ward god",
      tone: "good",
      ranking: award(visionScorePerMinute, "max", detailGames),
      // Two decimals, not one: the whole roster lands between roughly 0.5 and
      // 3.0, so a single decimal would tie half of it together.
      format: (v) => v.toFixed(2),
      sub: detailSub,
      metric:
        "Vision score per minute — wards placed, wards killed, time held. A rate, so a long game doesn't win it on its own. Highest first.",
      detail: true,
    },
    {
      label: "Objective thief",
      tone: "good",
      ranking: award((a) => a.objectivesStolen, "max", detailGames),
      format: (v) => String(v),
      sub: detailSub,
      metric: "Dragons, barons and heralds stolen, all-time total. Most first.",
      detail: true,
    },
    {
      label: "Pentakills",
      tone: "good",
      ranking: award((a) => a.pentaKills, "max", detailGames),
      format: (v) => String(v),
      sub: detailSub,
      metric: "Pentakills, all-time total. Most first.",
      detail: true,
    },
    {
      // Not a good or a bad stat, just a lot of one — neutral tone keeps it from
      // reading as an achievement it isn't.
      label: "Most games",
      tone: "neutral",
      ranking: award((a) => a.games, "max"),
      format: (v) => String(v),
      sub: gamesSub,
      metric: "Tracked games played. Most first.",
    },
  ]);

  const hallOfShame: AwardSpec[] = visible([
    {
      label: "Worst KDA",
      tone: "bad",
      ranking: award(kdaRatio, "min"),
      format: formatKdaRatio,
      sub: gamesSub,
      metric: "(Kills + assists) ÷ deaths, over every tracked game. Lowest first.",
    },
    {
      label: "Worst CS/min",
      tone: "bad",
      ranking: award(csPerMinute, "min", csGames),
      format: oneDecimal,
      sub: csSub,
      metric: "Creep score per minute. Support games are excluded on both sides. Lowest first.",
    },
    {
      label: "Most deaths/game",
      tone: "bad",
      ranking: award(deathsPerGame, "max"),
      format: oneDecimal,
      sub: gamesSub,
      metric: "Deaths per game. Most first.",
    },
    {
      label: "Time spent dead",
      tone: "bad",
      ranking: award(minutesSpentDead, "max", detailGames),
      format: (v) => `${Math.round(v)}m`,
      sub: detailSub,
      metric: "Total minutes on the grey screen, all-time. Most first — playing more will win this.",
      detail: true,
    },
    {
      // The fair version of the tile beside it — playing the most games would
      // otherwise win the raw total by default.
      label: "% of game dead",
      tone: "bad",
      ranking: award(deadTimeShare, "max", detailGames),
      format: (v) => `${v.toFixed(1)}%`,
      sub: detailSub,
      metric: "Share of total game time spent dead. The version of the tile beside it that game count can't win. Most first.",
      detail: true,
    },
    {
      label: "Most ? pings",
      tone: "neutral",
      ranking: award(missingPingsPerGame, "max", detailGames),
      format: oneDecimal,
      sub: (games) => `per game · ${detailSub(games)}`,
      metric: "Enemy-missing pings per game. Most first.",
      detail: true,
    },
  ]);

  const matchList = matchListFull ?? [];
  const matchIds = matchList.map((m) => m.id);
  const [{ data: allParticipants }, championMap] = await Promise.all([
    matchIds.length > 0
      ? supabase
          .from("match_participants")
          .select(
            "id, match_id, player_id, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, damage_dealt_to_champions, total_cs, vision_score",
          )
          .in("match_id", matchIds)
          .returns<ParticipantRow[]>()
      : Promise.resolve({ data: [] as ParticipantRow[] }),
    getChampionMap(version),
  ]);

  const participantsByMatch = new Map<string, ParticipantRow[]>();
  for (const p of allParticipants ?? []) {
    const list = participantsByMatch.get(p.match_id) ?? [];
    list.push(p);
    participantsByMatch.set(p.match_id, list);
  }

  const activityEntries = matchList.flatMap((m) => {
    const participants = participantsByMatch.get(m.id) ?? [];
    const trackedViewers = participants.filter((p) => p.player_id);

    return trackedViewers.map((viewer) => {
      const toChampion = (p: ParticipantRow): TeamComposChampion => ({
        championId: p.champion_id,
        championName: p.champion_name,
        kills: p.kills,
        isSelf: p.id === viewer.id,
      });
      const allies = sortByRole(participants.filter((p) => p.team_id === viewer.team_id)).map(toChampion);
      const enemies = sortByRole(participants.filter((p) => p.team_id !== viewer.team_id)).map(toChampion);
      const opponentParticipant = findLaneOpponent(participants, viewer);
      const opponent = opponentParticipant ? toChampion(opponentParticipant) : null;

      return {
        match: m,
        viewer,
        opponent,
        allies,
        enemies,
        player: playersById.get(viewer.player_id as string),
      };
    });
  });
  const recentActivity = activityEntries.slice(0, ACTIVITY_FEED_LIMIT);

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
                  playerSlug={player?.slug as string}
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
                          {onFire ? "🔥" : "💀"}
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
