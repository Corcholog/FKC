import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { formatRank, formatWinLoss, formatWinRate } from "@/lib/rank";
import { MatchRow, type TeamComposChampion } from "@/components/match-row";
import { AiSummaryCard } from "@/components/ai-summary-card";

type MatchListRow = {
  id: string;
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

const ROLE_ORDER: Record<string, number> = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };
function byRole(a: ParticipantRow, b: ParticipantRow): number {
  const ra = ROLE_ORDER[a.team_position ?? ""] ?? 5;
  const rb = ROLE_ORDER[b.team_position ?? ""] ?? 5;
  return ra - rb;
}

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: player } = await supabase.from("players").select("*").eq("id", id).single();
  if (!player) notFound();

  // Query from matches (not match_participants) so game_creation is a true
  // top-level column — PostgREST's foreignTable order only reorders embedded
  // to-many collections within each parent, it can't reorder the parent rows
  // by a column in a to-one join, so ordering "through" match_participants
  // silently no-ops and returns rows in insertion order instead.
  const { data: matchList } = await supabase
    .from("matches")
    .select("id, game_creation, game_duration_seconds, match_participants!inner(player_id)")
    .eq("match_participants.player_id", id)
    .order("game_creation", { ascending: false })
    .returns<MatchListRow[]>();

  // Separate bulk fetch for every participant (both teams) of those matches —
  // the filtered embed above only returns the one row matching player_id, not
  // all 10, so full team compositions need their own unfiltered query.
  const matchIds = (matchList ?? []).map((m) => m.id);
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

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);

  const { data: aiSummary } = await supabase
    .from("player_ai_summaries")
    .select("summary_text, generated_at, stale")
    .eq("player_id", id)
    .maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center gap-4 rounded-lg border border-border bg-bg-secondary p-4">
        {player.avatar_url ? (
          <Image
            src={player.avatar_url}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-blue-muted" />
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-white">{player.display_name}</h1>
          <p className="truncate text-xs text-grey-light">
            {player.riot_game_name}#{player.riot_tag_line}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded-full bg-blue-muted px-2 py-0.5 text-xs text-white">
              {formatRank(player.tier, player.division)}
            </span>
            {player.tier && (
              <span className="tabular-nums text-xs text-grey-light">{player.league_points ?? 0} LP</span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="tabular-nums font-semibold text-white">
            {formatWinLoss(player.wins, player.losses)}
          </p>
          <p className="tabular-nums text-xs text-grey-light">
            {formatWinRate(player.wins, player.losses)}
          </p>
        </div>
      </div>

      <AiSummaryCard
        playerId={id}
        initialSummary={aiSummary?.summary_text ?? null}
        initialGeneratedAt={aiSummary?.generated_at ?? null}
        isStale={!aiSummary || aiSummary.stale}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">Match history</h2>
        {!matchList || matchList.length === 0 ? (
          <p className="text-sm text-grey-mid">No tracked matches yet.</p>
        ) : (
          matchList.map((m) => {
            const participants = participantsByMatch.get(m.id) ?? [];
            const viewer = participants.find((p) => p.player_id === id);
            if (!viewer) return null;

            const toChampion = (p: ParticipantRow): TeamComposChampion => ({
              championId: p.champion_id,
              championName: p.champion_name,
              isOpponent:
                p.team_id !== viewer.team_id &&
                !!viewer.team_position &&
                p.team_position === viewer.team_position,
            });

            const allies = participants
              .filter((p) => p.team_id === viewer.team_id)
              .sort(byRole)
              .map(toChampion);
            const enemies = participants
              .filter((p) => p.team_id !== viewer.team_id)
              .sort(byRole)
              .map(toChampion);

            return (
              <MatchRow
                key={viewer.id}
                match={{
                  matchId: m.id,
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
                  allies,
                  enemies,
                }}
                version={version}
                championMap={championMap}
                playerId={id}
              />
            );
          })
        )}
      </section>
    </main>
  );
}
