import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getLatestVersion, getChampionMap, championIconUrl } from "@/lib/ddragon";
import { formatDuration, formatKDA, formatRelativeTime } from "@/lib/format";

type Participant = {
  puuid: string;
  riot_game_name: string | null;
  riot_tag_line: string | null;
  player_id: string | null;
  team_id: number;
  champion_id: number;
  champion_name: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  damage_dealt_to_champions: number;
  gold_earned: number;
  total_cs: number;
};

function ParticipantRow({
  participant,
  version,
  championMap,
}: {
  participant: Participant;
  version: string;
  championMap: Map<number, string>;
}) {
  const iconUrl = championIconUrl(participant.champion_id, version, championMap);
  const name = participant.riot_game_name
    ? `${participant.riot_game_name}#${participant.riot_tag_line}`
    : participant.champion_name;

  return (
    <div className="flex items-center gap-2 py-1.5">
      {iconUrl ? (
        <Image src={iconUrl} alt={participant.champion_name} width={28} height={28} className="h-7 w-7 rounded" />
      ) : (
        <div className="h-7 w-7 rounded bg-blue-muted" />
      )}
      <p className="flex-1 truncate text-xs text-white">{name}</p>
      <p className="tabular-nums text-xs text-grey-light">
        {formatKDA(participant.kills, participant.deaths, participant.assists)}
      </p>
      <p className="tabular-nums w-16 text-right text-xs text-grey-light">
        {participant.damage_dealt_to_champions.toLocaleString()}
      </p>
      <p className="tabular-nums w-14 text-right text-xs text-grey-light">
        {participant.gold_earned.toLocaleString()}
      </p>
      <p className="tabular-nums w-10 text-right text-xs text-grey-light">{participant.total_cs}</p>
    </div>
  );
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>;
}) {
  const { id, matchId } = await params;
  const supabase = await createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, game_creation, game_duration_seconds")
    .eq("id", matchId)
    .single();
  if (!match) notFound();

  const { data: participants } = await supabase
    .from("match_participants")
    .select(
      "puuid, riot_game_name, riot_tag_line, player_id, team_id, champion_id, champion_name, win, kills, deaths, assists, damage_dealt_to_champions, gold_earned, total_cs",
    )
    .eq("match_id", matchId)
    .returns<Participant[]>();
  if (!participants || participants.length === 0) notFound();

  const viewer = participants.find((p) => p.player_id === id);
  const allyTeamId = viewer?.team_id ?? 100;
  const allies = participants.filter((p) => p.team_id === allyTeamId);
  const enemies = participants.filter((p) => p.team_id !== allyTeamId);

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8 sm:px-6">
      <Link href={`/player/${id}`} className="text-sm text-grey-light hover:text-white">
        ← Back
      </Link>

      <div className="flex items-center justify-between">
        <p className={`font-semibold ${viewer?.win ? "text-win" : "text-loss"}`}>
          {viewer ? (viewer.win ? "Win" : "Loss") : "Match"}
        </p>
        <p className="text-xs text-grey-light">
          {formatRelativeTime(match.game_creation)} · {formatDuration(match.game_duration_seconds)}
        </p>
      </div>

      <div className="rounded-lg bg-blue-muted/30 p-3">
        <p className="mb-1 text-xs font-medium tracking-wide text-grey-light uppercase">Allies</p>
        {allies.map((p) => (
          <ParticipantRow key={p.puuid} participant={p} version={version} championMap={championMap} />
        ))}
      </div>

      <div className="rounded-lg bg-bg-tertiary p-3">
        <p className="mb-1 text-xs font-medium tracking-wide text-grey-light uppercase">Enemies</p>
        {enemies.map((p) => (
          <ParticipantRow key={p.puuid} participant={p} version={version} championMap={championMap} />
        ))}
      </div>
    </main>
  );
}
