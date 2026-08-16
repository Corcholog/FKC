import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import { getSession } from "@/lib/auth";
import { getLatestVersion, getChampionMap, championDisplayName } from "@/lib/ddragon";
import { notesByParticipant } from "@/lib/match-notes";
import { privateSource } from "@/lib/data-source";
import {
  groupParticipantsByMatch,
  loadMatchRowParticipants,
  matchComposition,
} from "@/lib/match-rows";
import { formatWinLoss, formatWinRate, ladderPoints } from "@/lib/rank";
import { aggregateByRole } from "@/lib/player-stats";
import { topChampionsByPlayer } from "@/lib/champion-stats";
import { computeStreak, formatStreak, NOTABLE_STREAK } from "@/lib/streaks";
import { matchupsForPlayer, nemesis, type MatchupInput } from "@/lib/matchups";
import { aggregateByTime } from "@/lib/time-stats";
import { aggregateByDuration, durationSwing, winRatePastMinute } from "@/lib/duration-stats";
import { laneDiffForPlayer, type LaneDiffInput } from "@/lib/lane-diff";
import { aggregateBySide } from "@/lib/side-stats";
import { MatchRow } from "@/components/match-row";
import { AiSummaryCard } from "@/components/ai-summary-card";
import { RankBadge } from "@/components/rank-badge";
import { WinrateRing } from "@/components/winrate-ring";
import { LpChart, type LpPoint } from "@/components/charts/lp-chart";
import { HourHeatmap } from "@/components/charts/hour-heatmap";
import { RoleSplit } from "@/components/player/role-split";
import { DurationSplit } from "@/components/player/duration-split";
import { DurationCurve } from "@/components/charts/duration-curve";
import { SideSplit } from "@/components/player/side-split";
import { LaneDiffPanel } from "@/components/player/lane-diff-panel";
import { MatchupList } from "@/components/player/matchup-list";
import { TopChampions } from "@/components/player/top-champions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionCard } from "@/components/section-card";

const RECENT_FORM_LIMIT = 5;
const TOP_CHAMPION_COUNT = 5;

type MatchListRow = {
  id: string;
  riot_match_id: string;
  game_creation: string;
  game_duration_seconds: number;
};


// Every participant of every match this player appears in — allies and enemies
// alike. Matchup stats need the enemy rows, which nothing else reads.
type FullHistoryRow = MatchupInput & {
  total_cs: number;
  damage_dealt_to_champions: number;
  matches: { game_creation: string; game_duration_seconds: number } | null;
};

type RankHistoryRow = {
  tier: string | null;
  division: string | null;
  league_points: number | null;
  recorded_at: string;
};

export default async function PlayerDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const [{ data: player }, version] = await Promise.all([
    supabase.from("players").select("*").eq("slug", slug).single(),
    getLatestVersion(),
  ]);
  if (!player) notFound();
  const id = player.id;

  // These all only depend on `id`/`version`, not on each other — run them
  // concurrently instead of sequential round trips.
  const [
    { data: matchListFull },
    { data: aiSummary },
    ownRows,
    { data: rankHistory },
    championMap,
  ] = await Promise.all([
    // Query from matches (not match_participants) so game_creation is a true
    // top-level column — PostgREST's foreignTable order only reorders embedded
    // to-many collections within each parent, it can't reorder the parent rows
    // by a column in a to-one join, so ordering "through" match_participants
    // silently no-ops and returns rows in insertion order instead.
    supabase
      .from("matches")
      .select("id, riot_match_id, game_creation, game_duration_seconds, match_participants!inner(player_id)")
      .eq("match_participants.player_id", id)
      .order("game_creation", { ascending: false })
      .limit(RECENT_FORM_LIMIT)
      .returns<MatchListRow[]>(),
    supabase
      .from("player_ai_summaries")
      .select("summary_text, generated_at, stale")
      .eq("player_id", id)
      .maybeSingle(),
    // This player's own row from every tracked match — role split, streaks and
    // the time heatmap all read from it. Paged, since "every tracked match" is
    // exactly the kind of read PostgREST truncates at Max rows without saying so.
    fetchAllRows<FullHistoryRow>((from, to) =>
      supabase
        .from("match_participants")
        .select(
          "match_id, player_id, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, total_cs, damage_dealt_to_champions, matches!inner(game_creation, game_duration_seconds)",
        )
        .eq("player_id", id)
        .range(from, to)
        .returns<FullHistoryRow[]>(),
    ),
    supabase
      .from("player_rank_history")
      .select("tier, division, league_points, recorded_at")
      .eq("player_id", id)
      .order("recorded_at", { ascending: true })
      .returns<RankHistoryRow[]>(),
    getChampionMap(version),
  ]);

  const matchList = matchListFull ?? [];

  const historyRows = ownRows.map((r) => ({
    ...r,
    game_duration_seconds: r.matches?.game_duration_seconds ?? 0,
    game_creation: r.matches?.game_creation ?? "",
  }));

  const roleSplit = aggregateByRole(historyRows);
  // Same rows as the role split — historyRows already carries every column
  // ChampionStatInput needs, so the champion strip costs no extra query.
  const topChampions = topChampionsByPlayer(historyRows, TOP_CHAMPION_COUNT).get(id) ?? [];
  const streak = computeStreak(historyRows);
  const streakLabel = formatStreak(streak);
  const timeStats = aggregateByTime(historyRows);

  // Games played since the summary was written. /api/summaries only rewrites a
  // summary once this reaches MIN_NEW_GAMES, so the card needs the number to
  // say when it will actually refresh rather than promising tomorrow. Counted
  // off historyRows, which is already loaded — no extra query.
  const summaryGeneratedAt = aiSummary?.generated_at ?? null;
  const newGamesSinceSummary = summaryGeneratedAt
    ? historyRows.filter((r) => r.game_creation > summaryGeneratedAt).length
    : historyRows.length;

  const lpPoints: LpPoint[] = [];
  for (const point of rankHistory ?? []) {
    const lp = ladderPoints(point);
    if (lp !== null) lpPoints.push({ t: new Date(point.recorded_at).getTime(), lp });
  }

  // Matchups need the *enemy* rows too, so they can't come from the query above.
  // Second round trip, once the match ids are known.
  //
  // Chunked and paged (see lib/supabase/fetch-all.ts): this is ten rows per
  // match over the player's entire history, so it's the query that crosses
  // PostgREST's Max rows soonest — at ~100 games — and it's also the one that
  // puts every match uuid into a query string.
  //
  // gold_earned, total_cs and damage_dealt_to_champions ride along for the lane
  // differentials. They're the enemy laner's copies of the three columns the
  // player's own query already returns — the comparison needs both sides, and
  // this is the only query that sees the opposing team.
  const historyMatchIds = [...new Set(historyRows.map((r) => r.match_id))];
  const allHistoryParticipants = await fetchAllByIds<MatchupInput & LaneDiffInput>(
    historyMatchIds,
    (chunk, from, to) =>
      supabase
        .from("match_participants")
        .select(
          "match_id, player_id, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, gold_earned, total_cs, damage_dealt_to_champions",
        )
        .in("match_id", chunk)
        .range(from, to)
        .returns<(MatchupInput & LaneDiffInput)[]>(),
  );

  const matchups = matchupsForPlayer(allHistoryParticipants, id);

  // Duration lives on matches, and the ten-row query above deliberately doesn't
  // embed it — ten copies of one number per match is a lot of payload for a
  // column the player's own rows already carry.
  const durationByMatch = new Map(historyRows.map((r) => [r.match_id, r.game_duration_seconds]));

  const durationBuckets = aggregateByDuration(historyRows);
  const survivalPoints = winRatePastMinute(historyRows);
  const swing = durationSwing(survivalPoints);
  const sideSplit = aggregateBySide(historyRows);
  const laneDiff = laneDiffForPlayer(allHistoryParticipants, id, durationByMatch);
  const worstMatchup = nemesis(matchups);
  const nemesisName = worstMatchup
    ? championDisplayName(worstMatchup.championId, championMap, worstMatchup.championName)
    : null;

  // Separate bulk fetch for every participant (both teams) of those matches —
  // the filtered embed above only returns the one row matching player_id, not
  // all 10, so full team compositions need their own unfiltered query.
  const matchIds = matchList.map((m) => m.id);
  const allParticipants = await loadMatchRowParticipants(privateSource(supabase), matchIds);
  const participantsByMatch = groupParticipantsByMatch(allParticipants);

  // Notes for exactly the recent-form rows about to render. Eager rather than
  // fetched on expand, so a collapsed row can show its note count.
  const recentFormParticipantIds = matchList
    .map((m) => (participantsByMatch.get(m.id) ?? []).find((p) => p.player_id === id)?.id)
    .filter((pid): pid is string => Boolean(pid));
  const [notesByParticipantId, session] = await Promise.all([
    notesByParticipant(supabase, recentFormParticipantIds),
    getSession(),
  ]);

  const totalGames = (player.wins ?? 0) + (player.losses ?? 0);
  const winRatePct = totalGames === 0 ? 0 : Math.round(((player.wins ?? 0) / totalGames) * 100);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Card className="panel-hex panel-hex-clip">
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
            <AvatarFallback className="text-lg">{player.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <h1 className="font-heading truncate text-xl font-semibold text-white">{player.display_name}</h1>
            <p className="truncate text-xs text-grey-light">
              {player.riot_game_name}#{player.riot_tag_line}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RankBadge tier={player.tier} division={player.division} leaguePoints={player.league_points} />
              {streakLabel && (
                <Badge
                  variant="outline"
                  className={
                    streak.current >= NOTABLE_STREAK
                      ? "border-win/40 text-win"
                      : "border-loss/40 text-loss"
                  }
                >
                  {streak.current >= NOTABLE_STREAK ? "🔥" : "💀"} {streakLabel}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="tabular-nums font-semibold text-white">
                {formatWinLoss(player.wins, player.losses)}
              </p>
              <p className="tabular-nums text-xs text-grey-light">
                {formatWinRate(player.wins, player.losses)}
              </p>
            </div>
            <WinrateRing percentage={winRatePct} />
          </div>
        </CardContent>
      </Card>

      {/* Opt-in per player (migration 009). Nothing is generated for anyone
          without the flag, so rendering the card would promise a summary that
          is never coming — the empty state reads as "not written yet". */}
      {player.ai_summary_enabled && (
        <AiSummaryCard
          summary={aiSummary?.summary_text ?? null}
          generatedAt={summaryGeneratedAt}
          isStale={!aiSummary || aiSummary.stale}
          newGames={newGamesSinceSummary}
        />
      )}

      <SectionCard title="Rank over time">
        <LpChart series={[{ id, name: player.display_name, points: lpPoints }]} />
      </SectionCard>

      <SectionCard
        title="Top champions"
        action={
          topChampions.length > 0 ? (
            <Link
              href={`/champions?player=${player.slug}`}
              className="text-xs text-gold-bright hover:underline"
            >
              View all →
            </Link>
          ) : undefined
        }
      >
        <TopChampions champions={topChampions} version={version} championMap={championMap} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SectionCard title="Roles">
          <RoleSplit byRole={roleSplit} />
        </SectionCard>

        <SectionCard title="Lane matchups">
          {nemesisName && worstMatchup && (
            <p className="text-sm text-grey-light">
              Nemesis: <span className="font-medium text-white">{nemesisName}</span>{" "}
              <span className="tabular-nums text-loss">
                {worstMatchup.wins}W {worstMatchup.games - worstMatchup.wins}L
              </span>
            </p>
          )}
          <MatchupList matchups={matchups} version={version} championMap={championMap} />
        </SectionCard>
      </div>

      <SectionCard
        title="Game length"
        caption={
          swing === null
            ? undefined
            : swing.delta < 0
              ? `Loses ${Math.abs(swing.delta)} points of winrate between ${swing.fromMinute}′ and ${swing.toMinute}′.`
              : `Gains ${swing.delta} points of winrate between ${swing.fromMinute}′ and ${swing.toMinute}′.`
        }
      >
        <DurationCurve points={survivalPoints} />
        <DurationSplit buckets={durationBuckets} />
      </SectionCard>

      <SectionCard title="Versus the lane opponent">
        <LaneDiffPanel agg={laneDiff} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SectionCard title="When they play">
          <HourHeatmap stats={timeStats} />
        </SectionCard>

        <SectionCard title="Map side">
          <SideSplit split={sideSplit} />
        </SectionCard>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">Recent form</h2>
          <Link href={`/matches?player=${player.slug}`} className="text-xs text-gold-bright hover:underline">
            View full history →
          </Link>
        </div>
        {matchList.length === 0 ? (
          <p className="text-sm text-grey-mid">No tracked matches yet.</p>
        ) : (
          matchList.map((m) => {
            const participants = participantsByMatch.get(m.id) ?? [];
            const viewer = participants.find((p) => p.player_id === id);
            if (!viewer) return null;

            const { allies, enemies, opponent } = matchComposition(participants, viewer);

            return (
              <MatchRow
                key={viewer.id}
                match={{
                  riotMatchId: m.riot_match_id,
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
                  gameCreation: m.game_creation,
                  gameDurationSeconds: m.game_duration_seconds,
                  opponent,
                  allies,
                  enemies,
                }}
                version={version}
                championMap={championMap}
                notes={{
                  participantId: viewer.id,
                  playerId: id,
                  ownerName: player.display_name,
                  items: notesByParticipantId.get(viewer.id) ?? [],
                  canAdd: session?.player?.id === id,
                  currentUserId: session?.user.id ?? null,
                }}
              />
            );
          })
        )}
      </section>
    </main>
  );
}
