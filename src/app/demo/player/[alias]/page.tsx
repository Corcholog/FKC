import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { buildPlayerProfile, fetchPlayerProfileRows } from "@/lib/loaders/player";
import { groupParticipantsByMatch, loadMatchRowParticipants } from "@/lib/match-rows";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { PlayerProfileView } from "@/components/player/player-profile-view";
import { RecentForm } from "@/components/player/recent-form";

export const dynamic = "force-dynamic";

// The same page as /player/[slug], against the demo views.
//
// [alias] rather than [slug] in the path because that is what it is: the segment
// is demo_aliases.alias_slug, which has no relationship to the real player's
// slug (that one is derived from their Riot ID, which is the thing being hidden).
//
// No notes and no AI card. Both are omitted by not passing the slot, rather than
// by a flag the view has to check — see the header of PlayerProfileView.
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
