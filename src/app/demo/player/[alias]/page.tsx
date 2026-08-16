import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { buildPlayerProfile, fetchPlayerProfileRows } from "@/lib/loaders/player";
import { groupParticipantsByMatch, loadMatchRowParticipants } from "@/lib/match-rows";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { AiSummaryCard } from "@/components/ai-summary-card";
import { PlayerProfileView } from "@/components/player/player-profile-view";
import { RecentForm } from "@/components/player/recent-form";

export const dynamic = "force-dynamic";

// The same page as /player/[slug], against the demo views.
//
// [alias] rather than [slug] in the path because that is what it is: the segment
// is demo_aliases.alias_slug, which has no relationship to the real player's
// slug (that one is derived from their Riot ID, which is the thing being hidden).
//
// No notes: omitted by not passing the slot, rather than by a flag the view has
// to check — see the header of PlayerProfileView.
//
// The summary slot *is* passed, but it is a different body of text from the
// private one: analyst-voice bullets written from aliases and published by hand
// from Settings (lib/summary-analyst.ts). It is absent until somebody publishes
// one, because demo_player_summaries filters out blank bodies — so the card
// only ever renders text a person has read.
export default async function DemoPlayerPage({ params }: { params: Promise<{ alias: string }> }) {
  const { alias } = await params;

  const [profileRows, version] = await Promise.all([
    cachedDemoLoad(`player:${alias}`, () =>
      fetchPlayerProfileRows(demoSource(createPublicClient()), alias),
    ),
    getLatestVersion(),
  ]);
  if (!profileRows) notFound();

  const profile = buildPlayerProfile(profileRows);
  const championMap = await getChampionMap(version);

  const matchIds = profile.matchList.map((m) => m.id);
  const participantsByMatch = groupParticipantsByMatch(
    await cachedDemoLoad(`player-rows:${alias}`, () =>
      loadMatchRowParticipants(demoSource(createPublicClient()), matchIds),
    ),
  );

  return (
    <PlayerProfileView
      profile={profile}
      version={version}
      championMap={championMap}
      basePath="/demo"
      summary={
        profile.aiSummary?.summary_text ? (
          <AiSummaryCard
            summary={profile.aiSummary.summary_text}
            generatedAt={profile.aiSummary.generated_at}
            // Nothing rewrites this text on a schedule, so it is never stale —
            // and the staleness hint counts games against a threshold that only
            // the private nightly batch enforces.
            isStale={false}
            newGames={0}
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
          basePath="/demo"
        />
      }
    />
  );
}
