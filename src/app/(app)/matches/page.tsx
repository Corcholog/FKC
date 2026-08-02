import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { findLaneOpponent, sortByRole } from "@/lib/roles";
import { MatchRow, type TeamComposChampion } from "@/components/match-row";
import { MatchesFilter } from "@/components/matches-filter";
import { MatchesPagination } from "@/components/matches-pagination";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Matches per page. This counts *matches*, not rendered rows: with no player
// filter, one game that several tracked players were in renders a row each, so
// a page can show more rows than this.
const MATCHES_PER_PAGE = 50;

// Page-number pagination rather than a cursor. The tradeoff: an offset can
// drift if rows are inserted at the head between page views, which here means
// only during a sync (daily, or when someone presses the button) — a match
// could then repeat across a page boundary. In exchange the page gets a real
// "page 2 of 7" and a total count, which a cursor can't give without a second
// query. At this history's size the deep-offset cost is nil.
function parsePage(raw: string | undefined): number {
  const parsed = Number(raw);
  // Rejects "abc", "0", "-3", "1.5" and Infinity — anything not a whole page.
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

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
  /** Null on games synced before migration 005. */
  vision_score: number | null;
};

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; page?: string }>;
}) {
  const { player: playerFilter, page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
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
  //
  // count: "exact" is returned alongside the page and counts parent rows, so
  // it's the number of matching *matches* — an embed doesn't multiply the
  // parent the way a SQL join would.
  const from = (page - 1) * MATCHES_PER_PAGE;
  let matchQuery = supabase
    .from("matches")
    .select(
      "id, riot_match_id, game_creation, game_duration_seconds, match_participants!inner(player_id)",
      { count: "exact" },
    )
    .order("game_creation", { ascending: false })
    .range(from, from + MATCHES_PER_PAGE - 1);

  matchQuery = selectedPlayer
    ? matchQuery.eq("match_participants.player_id", selectedPlayer.id)
    : matchQuery.not("match_participants.player_id", "is", null);

  const { data: matchListFull, count } = await matchQuery.returns<MatchListRow[]>();
  const matchList = matchListFull ?? [];

  const totalMatches = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalMatches / MATCHES_PER_PAGE));

  // Page 1 always renders — an empty roster or an unplayed filter is a valid
  // empty state, not a 404. Anything past the end is a genuine 404, the same
  // way /champions treats an unknown ?player=.
  if (page > 1 && matchList.length === 0) notFound();

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
              playerName={selectedPlayer ? undefined : player?.display_name}
            />
          ))
        )}
      </div>

      <MatchesPagination
        page={page}
        totalPages={totalPages}
        totalMatches={totalMatches}
        playerSlug={selectedPlayer?.slug ?? null}
      />
    </main>
  );
}
