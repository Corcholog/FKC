import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { notesByParticipant } from "@/lib/match-notes";
import { privateSource } from "@/lib/data-source";
import { needsRankedGames, needsTeamMatches, parseSource, queueScopeFor } from "@/lib/scope";
import { buildPlayerProfile, fetchPlayerProfileRows, type PlayerProfile } from "@/lib/loaders/player";
import { fetchPlayerTeamRows } from "@/lib/loaders/player-team-rows";
import {
  groupParticipantsByMatch,
  loadMatchRowParticipants,
  multiAccountNames,
} from "@/lib/match-rows";
import { PlayerProfileView } from "@/components/player/player-profile-view";
import { SourceSwitch } from "@/components/player/source-switch";
import { AccountFilter } from "@/components/player/account-filter";
import { RecentForm } from "@/components/player/recent-form";

// One player, in depth.
//
// Two controls, and they are different kinds of thing on purpose. The **source**
// is a link: each one reads a different table, so it is a different query and
// belongs in the URL. The **account** is not — every account's rows are read
// either way, so each narrowing is folded here and the filter picks between
// folds already in hand (components/player/account-filter.tsx).
export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { slug } = await params;
  const { source: sourceParam } = await searchParams;
  const source = parseSource(sourceParam);
  const supabase = await createClient();

  // The Riot half is a source swap and nothing more: every query in the loader
  // is unchanged, and reads soloq_participants, flex_participants or
  // ranked_participants depending on which one it was handed.
  const dataSource = privateSource(supabase, queueScopeFor(source));

  // Two passes, because the team rows are keyed by player id and the id comes
  // from the first read. Only paid for when the source asks for them.
  const firstPass = await fetchPlayerProfileRows(dataSource, slug, {
    riotGames: needsRankedGames(source),
  });
  if (!firstPass) notFound();

  const [profileRows, version] = await Promise.all([
    needsTeamMatches(source)
      ? fetchPlayerTeamRows(privateSource(supabase), firstPass.player.id).then((teamRows) => ({
          ...firstPass,
          teamRows,
        }))
      : Promise.resolve(firstPass),
    getLatestVersion(),
  ]);

  const profile = buildPlayerProfile(profileRows);
  const championMap = await getChampionMap(version);

  // The recent-form rows need all ten participants of those five matches, which
  // is a different shape from the history the aggregates fold over.
  const matchIds = profile.matchList.map((m) => m.id);
  const participantsByMatch = groupParticipantsByMatch(
    await loadMatchRowParticipants(dataSource, matchIds),
  );

  // Notes for exactly the rows about to render. Eager rather than fetched on
  // expand, so a collapsed row can show its note count.
  const recentFormParticipantIds = profile.matchList
    .map((m) => (participantsByMatch.get(m.id) ?? []).find((p) => p.player_id === profile.player.id)?.id)
    .filter((pid): pid is string => Boolean(pid));
  const [notesByParticipantId, session, accountNames] = await Promise.all([
    notesByParticipant(supabase, recentFormParticipantIds),
    getSession(),
    multiAccountNames(supabase),
  ]);

  const sourceSwitch = (
    <SourceSwitch
      active={source}
      basePath={`/players/${profile.player.slug}`}
      sample={profile.sampleLabel}
    />
  );
  const renderProfile = (one: PlayerProfile) => (
    <PlayerProfileView
      profile={one}
      version={version}
      championMap={championMap}
      sourceSwitch={sourceSwitch}
    />
  );

  // The filter is worth offering only where it can answer anything. A
  // competitive-only page has read no Riot rows at all, so every account would
  // show zero games and picking one would empty the page — nobody records which
  // account a scrim was played on, and it is the same five people either way.
  const perAccount =
    needsRankedGames(source) && profile.accounts.length > 1
      ? [
          profile,
          ...profile.accounts.map((account) => buildPlayerProfile(profileRows, account.puuid)),
        ].map(renderProfile)
      : null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      {perAccount ? (
        <AccountFilter
          accounts={profile.accounts}
          totalGames={profile.historyRows.length}
          views={perAccount}
        />
      ) : (
        renderProfile(profile)
      )}

      {/* Outside the account filter, because no account narrows it: this is its
          own five-row query, and the notes hanging off it are the person's. */}
      <RecentForm
        matchList={profile.matchList}
        participantsByMatch={participantsByMatch}
        playerId={profile.player.id}
        playerName={profile.player.display_name}
        playerSlug={profile.player.slug}
        version={version}
        championMap={championMap}
        notes={{
          byParticipant: notesByParticipantId,
          canAdd: session?.player?.id === profile.player.id,
          currentUserId: session?.user.id ?? null,
        }}
        accountNames={accountNames}
      />
    </main>
  );
}
