import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLatestVersion, getChampionMap, championIconUrl, championDisplayName, type ChampionInfo } from "@/lib/ddragon";
import { formatDuration, formatKDA, formatRelativeTime } from "@/lib/format";
import { sortByRole } from "@/lib/roles";
import { NotesSection } from "@/components/notes-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Participant = {
  id: string;
  puuid: string;
  riot_game_name: string | null;
  riot_tag_line: string | null;
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
  gold_earned: number;
  total_cs: number;
};

function ParticipantRow({
  participant,
  version,
  championMap,
  isViewer,
}: {
  participant: Participant;
  version: string;
  championMap: Map<number, ChampionInfo>;
  isViewer: boolean;
}) {
  const iconUrl = championIconUrl(participant.champion_id, version, championMap);
  const championName = championDisplayName(participant.champion_id, championMap, participant.champion_name);
  const name = participant.riot_game_name
    ? `${participant.riot_game_name}#${participant.riot_tag_line}`
    : championName;

  return (
    <div className={`flex items-center gap-2 rounded-lg px-1.5 py-1.5 ${isViewer ? "bg-gold-muted/30" : ""}`}>
      {iconUrl ? (
        <Image
          src={iconUrl}
          alt={championName}
          width={28}
          height={28}
          className={`h-7 w-7 rounded-md ${isViewer ? "ring-2 ring-gold" : ""}`}
        />
      ) : (
        <div className="h-7 w-7 rounded-md bg-gold-muted" />
      )}
      <p className="min-w-0 flex-1 truncate text-xs text-white">{name}</p>
      <p className="tabular-nums w-20 text-xs text-grey-light">
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

function ParticipantHeader() {
  return (
    <div className="flex items-center gap-2 border-b border-border px-1.5 pb-1.5">
      <div className="h-7 w-7 shrink-0" />
      <p className="min-w-0 flex-1 text-[10px] font-medium tracking-wide text-grey-mid uppercase">Player</p>
      <p className="w-20 text-[10px] font-medium tracking-wide text-grey-mid uppercase">KDA</p>
      <p className="w-16 text-right text-[10px] font-medium tracking-wide text-grey-mid uppercase">Dmg</p>
      <p className="w-14 text-right text-[10px] font-medium tracking-wide text-grey-mid uppercase">Gold</p>
      <p className="w-10 text-right text-[10px] font-medium tracking-wide text-grey-mid uppercase">CS</p>
    </div>
  );
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ slug: string; riotMatchId: string }>;
}) {
  const { slug, riotMatchId } = await params;
  const supabase = await createClient();

  const { data: player } = await supabase.from("players").select("id, slug").eq("slug", slug).single();
  if (!player) notFound();
  const id = player.id;

  const { data: match } = await supabase
    .from("matches")
    .select("id, game_creation, game_duration_seconds")
    .eq("riot_match_id", riotMatchId)
    .single();
  if (!match) notFound();

  const { data: participants } = await supabase
    .from("match_participants")
    .select(
      "id, puuid, riot_game_name, riot_tag_line, player_id, team_id, team_position, champion_id, champion_name, win, kills, deaths, assists, damage_dealt_to_champions, gold_earned, total_cs",
    )
    .eq("match_id", match.id)
    .returns<Participant[]>();
  if (!participants || participants.length === 0) notFound();

  const viewer = participants.find((p) => p.player_id === id);
  const allyTeamId = viewer?.team_id ?? 100;
  const allies = sortByRole(participants.filter((p) => p.team_id === allyTeamId));
  const enemies = sortByRole(participants.filter((p) => p.team_id !== allyTeamId));

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);

  const notes = viewer
    ? (
        await supabase
          .from("match_notes")
          .select("id, note, author_name, created_at")
          .eq("match_participant_id", viewer.id)
          .order("created_at", { ascending: false })
      ).data ?? []
    : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8 sm:px-6">
      <Link href={`/player/${slug}`} className="flex items-center gap-1.5 text-sm text-grey-light hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <div className="flex items-center justify-between">
        <Badge
          variant="outline"
          className={`text-sm font-semibold ${viewer?.win ? "border-win/40 text-win" : "border-loss/40 text-loss"}`}
        >
          {viewer ? (viewer.win ? "Win" : "Loss") : "Match"}
        </Badge>
        <p className="text-xs text-grey-light">
          {formatRelativeTime(match.game_creation)} · {formatDuration(match.game_duration_seconds)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xs tracking-wide text-grey-light uppercase">Allies</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-0.5">
          <ParticipantHeader />
          {allies.map((p) => (
            <ParticipantRow
              key={p.puuid}
              participant={p}
              version={version}
              championMap={championMap}
              isViewer={p.id === viewer?.id}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xs tracking-wide text-grey-light uppercase">Enemies</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-0.5">
          <ParticipantHeader />
          {enemies.map((p) => (
            <ParticipantRow
              key={p.puuid}
              participant={p}
              version={version}
              championMap={championMap}
              isViewer={false}
            />
          ))}
        </CardContent>
      </Card>

      {viewer && (
        <NotesSection matchParticipantId={viewer.id} playerId={id} notes={notes} />
      )}
    </main>
  );
}
