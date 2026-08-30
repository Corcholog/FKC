import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { notesByParticipant } from "@/lib/match-notes";
import { privateSource } from "@/lib/data-source";
import { needsTeamMatches, parseScope, queueScopeFor } from "@/lib/scope";
import { buildPlayerProfile, fetchPlayerProfileRows } from "@/lib/loaders/player";
import { fetchPlayerTeamRows } from "@/lib/loaders/player-team-rows";
import { groupParticipantsByMatch, loadMatchRowParticipants } from "@/lib/match-rows";
import { AiSummaryCard } from "@/components/ai-summary-card";
import { PlayerProfileView } from "@/components/player/player-profile-view";
import { ScopeSwitch } from "@/components/player/scope-switch";
import { RecentForm } from "@/components/player/recent-form";

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { slug } = await params;
  const scope = parseScope((await searchParams).scope);
  const supabase = await createClient();

  // The Riot half is a source swap and nothing more: every query in the loader
  // is unchanged, and reads soloq_participants or ranked_participants depending
  // on which one it was handed.
  const source = privateSource(supabase, queueScopeFor(scope));

  // Two passes, because the team rows are keyed by player id and the id comes
  // from the first read. Only paid for when the scope asks for them.
  const firstPass = await fetchPlayerProfileRows(source, slug);
  if (!firstPass) notFound();

  const [profileRows, version] = await Promise.all([
    needsTeamMatches(scope)
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
    await loadMatchRowParticipants(source, matchIds),
  );

  // Notes for exactly the rows about to render. Eager rather than fetched on
  // expand, so a collapsed row can show its note count.
  const recentFormParticipantIds = profile.matchList
    .map((m) => (participantsByMatch.get(m.id) ?? []).find((p) => p.player_id === profile.player.id)?.id)
    .filter((pid): pid is string => Boolean(pid));
  const [notesByParticipantId, session] = await Promise.all([
    notesByParticipant(supabase, recentFormParticipantIds),
    getSession(),
  ]);

  return (
    <PlayerProfileView
      profile={profile}
      version={version}
      championMap={championMap}
      scopeSwitch={
        <ScopeSwitch
          active={scope}
          basePath={`/player/${profile.player.slug}`}
          sample={profile.sampleLabel}
        />
      }
      summary={
        // Opt-in per player (migration 009). Nothing is generated for anyone
        // without the flag, so rendering the card would promise a summary that
        // is never coming — the empty state reads as "not written yet".
        profile.player.ai_summary_enabled ? (
          <AiSummaryCard
            summary={profile.aiSummary?.summary_text ?? null}
            generatedAt={profile.aiSummary?.generated_at ?? null}
            isStale={!profile.aiSummary || Boolean(profile.aiSummary.stale)}
            newGames={profile.newGamesSinceSummary}
          />
        ) : undefined
      }
      recentForm={
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
        />
      }
    />
  );
}
