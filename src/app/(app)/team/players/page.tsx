import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { privateSource, type QueueScope } from "@/lib/data-source";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadTeamRoster } from "@/lib/team/roster";
import { fetchTeamPlayersRows } from "@/lib/loaders/team-players";
import { PLAYER_SOURCES, parsePlayerSource, recordsFor } from "@/lib/team/player-source";
import { allChampionsByPlayer } from "@/lib/champion-stats";
import { aggregatePlayerStats } from "@/lib/player-stats";
import type { UnifiedRow } from "@/lib/unified";
import type { PlayerSource } from "@/lib/team/player-source";
import { TeamPlayersView, type TeamPlayerCard } from "@/components/team/views/players-view";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";

export default async function TeamPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; source?: string }>;
}) {
  const { player: playerParam, source: sourceParam } = await searchParams;
  const source = parsePlayerSource(sourceParam);
  const supabase = await createClient();

  const team = await loadTeamRoster(privateSource(supabase));
  if (team.length === 0) return <TeamMatchEmptyState canAdd />;

  const rows = await fetchTeamPlayersRows(
    (queue: QueueScope) => privateSource(supabase, queue),
    team.map((m) => m.id),
  );

  // An unknown ?player= is a 404 rather than a silent fallback: the roster rail
  // is a list of links, so a slug that isn't on it came from a stale bookmark or
  // a typo, and quietly showing somebody else's numbers under that URL is worse
  // than saying no.
  const selectedMember = playerParam
    ? (team.find((m) => m.slug === playerParam) ?? null)
    : team[0];
  if (!selectedMember) notFound();

  const rowsFor = (s: PlayerSource): UnifiedRow[] =>
    recordsFor(s).flatMap((record) => rows[record]);

  // The rail is built from the *selected* source, so switching it re-ranks
  // everybody's top three rather than leaving the left column describing a
  // different question from the right.
  const scoped = rowsFor(source);
  const byPlayer = aggregatePlayerStats(scoped);
  const championsByPlayer = allChampionsByPlayer(scoped);

  const cards: TeamPlayerCard[] = team.map((member) => ({
    member,
    agg: byPlayer.get(member.id),
    top: championsByPlayer.get(member.id) ?? [],
  }));
  const selected = cards.find((c) => c.member.id === selectedMember.id) as TeamPlayerCard;

  const counts = Object.fromEntries(
    PLAYER_SOURCES.map((s) => [
      s,
      rowsFor(s).filter((row) => row.player_id === selectedMember.id).length,
    ]),
  ) as Record<PlayerSource, number>;

  const version = await getLatestVersion();

  return (
    <TeamPlayersView
      cards={cards}
      selected={selected}
      source={source}
      counts={counts}
      version={version}
      championMap={await getChampionMap(version)}
    />
  );
}
