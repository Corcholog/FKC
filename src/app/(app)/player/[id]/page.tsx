import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { formatRank, formatWinLoss, formatWinRate } from "@/lib/rank";
import { MatchRow } from "@/components/match-row";
import { AiSummaryCard } from "@/components/ai-summary-card";

type MatchParticipantRow = {
  id: string;
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damage_dealt_to_champions: number;
  gold_earned: number;
  total_cs: number;
  matches: { id: string; game_creation: string; game_duration_seconds: number } | null;
};

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: player } = await supabase.from("players").select("*").eq("id", id).single();
  if (!player) notFound();

  const { data: history } = await supabase
    .from("match_participants")
    .select(
      "id, champion_id, champion_name, win, kills, deaths, assists, damage_dealt_to_champions, gold_earned, total_cs, matches!inner(id, game_creation, game_duration_seconds)",
    )
    .eq("player_id", id)
    .order("game_creation", { foreignTable: "matches", ascending: false })
    .returns<MatchParticipantRow[]>();

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
        {!history || history.length === 0 ? (
          <p className="text-sm text-grey-mid">No tracked matches yet.</p>
        ) : (
          history.map((h) => (
            <MatchRow
              key={h.id}
              match={{
                matchId: h.matches!.id,
                championId: h.champion_id,
                championName: h.champion_name,
                win: h.win,
                kills: h.kills,
                deaths: h.deaths,
                assists: h.assists,
                damageDealtToChampions: h.damage_dealt_to_champions,
                goldEarned: h.gold_earned,
                totalCs: h.total_cs,
                gameCreation: h.matches!.game_creation,
                gameDurationSeconds: h.matches!.game_duration_seconds,
              }}
              version={version}
              championMap={championMap}
              playerId={id}
            />
          ))
        )}
      </section>
    </main>
  );
}
