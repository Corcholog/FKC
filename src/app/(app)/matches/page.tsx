import { createClient } from "@/lib/supabase/server";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { sortByRole } from "@/lib/roles";
import { MatchRow, type TeamComposChampion } from "@/components/match-row";
import { MatchesFilter } from "@/components/matches-filter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const MATCH_LIMIT = 50;

type PlayerRow = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
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

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
}) {
  const { player: playerFilter } = await searchParams;
  const supabase = await createClient();

  const [{ data: players }, version] = await Promise.all([
    supabase
      .from("players")
      .select("id, slug, display_name, avatar_url")
      .order("display_name")
      .returns<PlayerRow[]>(),
    getLatestVersion(),
  ]);
  const playersById = new Map((players ?? []).map((p) => [p.id, p]));
  const selectedPlayer = playerFilter ? players?.find((p) => p.slug === playerFilter) ?? null : null;

  // Query from matches (true top-level order — see player/[slug]/page.tsx for
  // why ordering "through" an embedded match_participants collection no-ops).
  let matchQuery = supabase
    .from("matches")
    .select("id, riot_match_id, game_creation, game_duration_seconds, match_participants!inner(player_id)")
    .order("game_creation", { ascending: false })
    .limit(MATCH_LIMIT);

  matchQuery = selectedPlayer
    ? matchQuery.eq("match_participants.player_id", selectedPlayer.id)
    : matchQuery.not("match_participants.player_id", "is", null);

  const { data: matchListFull } = await matchQuery.returns<MatchListRow[]>();
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

  const entries = matchList.flatMap((m) => {
    const participants = participantsByMatch.get(m.id) ?? [];
    const viewers = selectedPlayer
      ? participants.filter((p) => p.player_id === selectedPlayer.id)
      : participants.filter((p) => p.player_id);

    return viewers.map((viewer) => {
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {selectedPlayer && (
            <Avatar size="lg">
              {selectedPlayer.avatar_url && <AvatarImage src={selectedPlayer.avatar_url} alt="" />}
              <AvatarFallback>{selectedPlayer.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          )}
          <div>
            <h1 className="font-heading text-2xl font-semibold text-white">Matches</h1>
            <p className="text-sm text-grey-light">
              {selectedPlayer ? `${selectedPlayer.display_name}'s match history.` : "Every tracked match across the squad."}
            </p>
          </div>
        </div>
        <MatchesFilter players={players ?? []} selectedId={selectedPlayer?.slug ?? null} />
      </div>

      <div className="flex flex-col gap-2">
        {entries.length === 0 ? (
          <p className="text-sm text-grey-mid">No tracked matches yet.</p>
        ) : (
          entries.map(({ match, viewer, opponent, allies, enemies, player }) => (
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
              playerName={selectedPlayer ? undefined : player?.display_name}
            />
          ))
        )}
      </div>
    </main>
  );
}
