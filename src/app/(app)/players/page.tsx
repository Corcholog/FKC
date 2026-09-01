import { createClient } from "@/lib/supabase/server";
import { privateSource, type QueueScope } from "@/lib/data-source";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadTeamRoster } from "@/lib/team/roster";
import { fetchPlayerRecordRows } from "@/lib/loaders/players";
import { parseSource, recordsFor } from "@/lib/scope";
import { allChampionsByPlayer } from "@/lib/champion-stats";
import { aggregatePlayerStats } from "@/lib/player-stats";
import { RosterGrid, type PlayerCardData } from "@/components/players/roster-grid";
import { SourceSwitch } from "@/components/player/source-switch";

// The roster — five cards in role order, over whichever games the switch picks.
//
// The cards re-rank with the source, which is why the whole history is read
// here rather than per card: "who is on form in scrims" and "who is on form in
// soloQ" are different lists, and a grid that answered only the second would be
// the old /roster with a new name.
export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const source = parseSource((await searchParams).source);
  const supabase = await createClient();

  const team = await loadTeamRoster(privateSource(supabase));

  const [rows, version] = await Promise.all([
    fetchPlayerRecordRows(
      (queue: QueueScope) => privateSource(supabase, queue),
      team.map((m) => m.id),
    ),
    getLatestVersion(),
  ]);

  const scoped = recordsFor(source).flatMap((record) => rows[record]);
  const byPlayer = aggregatePlayerStats(scoped);
  const championsByPlayer = allChampionsByPlayer(scoped);

  const cards: PlayerCardData[] = team.map((member) => ({
    member,
    rank: {
      tier: member.tier,
      division: member.division,
      leaguePoints: member.league_points,
    },
    agg: byPlayer.get(member.id),
    top: championsByPlayer.get(member.id) ?? [],
  }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Players</h1>
        <p className="text-sm text-grey-light">
          The five, in role order. A card with no games is a card with no games — the roster
          is read from the team, not from whoever turns up in the rows.
        </p>
      </div>

      <SourceSwitch active={source} basePath="/players" />

      <RosterGrid
        cards={cards}
        source={source}
        version={version}
        championMap={await getChampionMap(version)}
      />
    </main>
  );
}
