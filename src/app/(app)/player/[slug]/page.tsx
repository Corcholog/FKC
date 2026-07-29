import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { formatWinLoss, formatWinRate } from "@/lib/rank";
import { MatchRow, type TeamComposChampion } from "@/components/match-row";
import { AiSummaryCard } from "@/components/ai-summary-card";
import { RankBadge } from "@/components/rank-badge";
import { WinrateRing } from "@/components/winrate-ring";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { sortByRole } from "@/lib/roles";

const RECENT_FORM_LIMIT = 5;

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

export default async function PlayerDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const [{ data: player }, version] = await Promise.all([
    supabase.from("players").select("*").eq("slug", slug).single(),
    getLatestVersion(),
  ]);
  if (!player) notFound();
  const id = player.id;

  // These three only depend on `id`/`version`, not on each other — run them
  // concurrently instead of three sequential round trips.
  const [{ data: matchListFull }, { data: aiSummary }, championMap] = await Promise.all([
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
    getChampionMap(version),
  ]);

  const matchList = matchListFull ?? [];

  // Separate bulk fetch for every participant (both teams) of those matches —
  // the filtered embed above only returns the one row matching player_id, not
  // all 10, so full team compositions need their own unfiltered query.
  const matchIds = matchList.map((m) => m.id);
  const { data: allParticipants } =
    matchIds.length > 0
      ? await supabase
          .from("match_participants")
          .select(
            "id, match_id, player_id, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, damage_dealt_to_champions, total_cs",
          )
          .in("match_id", matchIds)
          .returns<ParticipantRow[]>()
      : { data: [] as ParticipantRow[] };

  const participantsByMatch = new Map<string, ParticipantRow[]>();
  for (const p of allParticipants ?? []) {
    const list = participantsByMatch.get(p.match_id) ?? [];
    list.push(p);
    participantsByMatch.set(p.match_id, list);
  }

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
            <div className="mt-2">
              <RankBadge tier={player.tier} division={player.division} leaguePoints={player.league_points} />
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

      <AiSummaryCard
        playerId={id}
        initialSummary={aiSummary?.summary_text ?? null}
        initialGeneratedAt={aiSummary?.generated_at ?? null}
        isStale={!aiSummary || aiSummary.stale}
      />

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

            const toChampion = (p: ParticipantRow): TeamComposChampion => ({
              championId: p.champion_id,
              championName: p.champion_name,
              kills: p.kills,
              isSelf: p.id === viewer.id,
            });

            const allies = sortByRole(participants.filter((p) => p.team_id === viewer.team_id)).map(toChampion);
            const enemyParticipants = sortByRole(participants.filter((p) => p.team_id !== viewer.team_id));
            const enemies = enemyParticipants.map(toChampion);
            const opponentParticipant = viewer.team_position
              ? enemyParticipants.find((p) => p.team_position === viewer.team_position)
              : undefined;
            const opponent = opponentParticipant ? toChampion(opponentParticipant) : null;

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
                  gameCreation: m.game_creation,
                  gameDurationSeconds: m.game_duration_seconds,
                  opponent,
                  allies,
                  enemies,
                }}
                version={version}
                championMap={championMap}
                playerSlug={player.slug}
              />
            );
          })
        )}
      </section>
    </main>
  );
}
