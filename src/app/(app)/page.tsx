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
  pickAward,
  playerWinRate,
  visionScorePerGame,
  type PlayerAgg,
  type PlayerStatInput,
} from "@/lib/player-stats";
import { streaksByPlayer, formatStreak, NOTABLE_STREAK } from "@/lib/streaks";
import { MatchRow, type TeamComposChampion } from "@/components/match-row";
import { AwardTile } from "@/components/award-tile";
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

  // These five are independent of each other — run them concurrently instead
  // of paying for five sequential round trips.
  const [
    { data: players },
    { data: syncState },
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
  const award = (
    score: (agg: PlayerAgg) => number,
    direction: "max" | "min",
    qualifier: (agg: PlayerAgg) => number = (agg) => agg.games,
  ) => pickAward(roster, awardStats, (p) => p.id, score, qualifier, direction);

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
    result: ReturnType<typeof award>;
    format: (value: number) => string;
    sub: (games: number) => string;
  };

  const awards: AwardSpec[] = [
    { label: "Best KDA", tone: "good", result: award(kdaRatio, "max"), format: formatKdaRatio, sub: gamesSub },
    { label: "Worst KDA", tone: "bad", result: award(kdaRatio, "min"), format: formatKdaRatio, sub: gamesSub },
    { label: "Best CS/min", tone: "good", result: award(csPerMinute, "max", csGames), format: oneDecimal, sub: csSub },
    { label: "Worst CS/min", tone: "bad", result: award(csPerMinute, "min", csGames), format: oneDecimal, sub: csSub },
    {
      label: "Highest winrate",
      tone: "good",
      result: award(playerWinRate, "max"),
      format: (v) => `${v}%`,
      sub: gamesSub,
    },
    {
      label: "Most games",
      tone: "neutral",
      result: award((a) => a.games, "max"),
      format: (v) => String(v),
      sub: gamesSub,
    },
    {
      label: "Best damage/min",
      tone: "good",
      result: award(damagePerMinute, "max"),
      // Four-digit figure in a headline font — a tenth of a damage point is noise.
      format: (v) => Math.round(v).toLocaleString("en-US"),
      sub: gamesSub,
    },
    {
      label: "Most deaths/game",
      tone: "bad",
      result: award(deathsPerGame, "max"),
      format: oneDecimal,
      sub: gamesSub,
    },
  ];

  const hallOfShame: AwardSpec[] = [
    {
      label: "Time spent dead",
      tone: "bad",
      result: award(minutesSpentDead, "max", detailGames),
      format: (v) => `${Math.round(v)}m`,
      sub: detailSub,
    },
    {
      // The fair version of the tile beside it — playing the most games would
      // otherwise win the raw total by default.
      label: "% of game dead",
      tone: "bad",
      result: award(deadTimeShare, "max", detailGames),
      format: (v) => `${v.toFixed(1)}%`,
      sub: detailSub,
    },
    {
      label: "Most ? pings",
      tone: "neutral",
      result: award(missingPingsPerGame, "max", detailGames),
      format: oneDecimal,
      sub: (games) => `per game · ${detailSub(games)}`,
    },
    {
      label: "Ward god",
      tone: "good",
      result: award(visionScorePerGame, "max", detailGames),
      format: (v) => String(Math.round(v)),
      sub: detailSub,
    },
    {
      label: "Objective thief",
      tone: "good",
      result: award((a) => a.objectivesStolen, "max", detailGames),
      format: (v) => String(v),
      sub: detailSub,
    },
    {
      label: "Pentakills",
      tone: "good",
      result: award((a) => a.pentaKills, "max", detailGames),
      format: (v) => String(v),
      sub: detailSub,
    },
  ];

  // Every one of these needs migration 005 data. Until the settings backfill has
  // run, the whole section would be six em dashes — better to not render it.
  const hasDetailedStats = [...awardStats.values()].some((agg) => agg.detailGames > 0);

  const matchList = matchListFull ?? [];
  const matchIds = matchList.map((m) => m.id);
  const [{ data: allParticipants }, championMap] = await Promise.all([
    matchIds.length > 0
      ? supabase
          .from("match_participants")
          .select(
            "id, match_id, player_id, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, damage_dealt_to_champions, total_cs",
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

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">Awards</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {awards.map(({ label, tone, result, format, sub }) => (
                <AwardTile
                  key={label}
                  label={label}
                  tone={tone}
                  player={result?.player ?? null}
                  value={result ? format(result.value) : ""}
                  sub={result ? sub(result.games) : undefined}
                />
              ))}
            </div>
          </section>

          {hasDetailedStats && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">
                Hall of shame
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {hallOfShame.map(({ label, tone, result, format, sub }) => (
                  <AwardTile
                    key={label}
                    label={label}
                    tone={tone}
                    player={result?.player ?? null}
                    value={result ? format(result.value) : ""}
                    sub={result ? sub(result.games) : undefined}
                  />
                ))}
              </div>
            </section>
          )}

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
        </div>
      </div>
    </main>
  );
}
