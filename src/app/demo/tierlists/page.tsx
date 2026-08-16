import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { buildTierLists, fetchTierListsRows } from "@/lib/loaders/tierlists";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import type { TierChampion } from "@/lib/tierlist";
import { DownloadPngButton } from "@/components/tierlist/download-png-button";
import { TierListsBoard } from "@/components/tierlist/tier-lists-board";

export const dynamic = "force-dynamic";

// The tier lists, read-only.
//
// There is no /demo/tierlists/[alias] on purpose: privately that route is the
// drag-and-drop editor, and it imports the save server action at module scope.
// A public copy would mean either a route that doesn't exist in the real app or
// threading a read-only mode through a 540-line client component whose failure
// mode is a public page writing to the private database. The overview already
// renders every list in full, which is what a visitor came for.
//
// The PNG export stays: it captures an off-screen node entirely in the browser
// and writes nothing.
export default async function DemoTierListsPage() {
  const [tierListRows, version] = await Promise.all([
    cachedDemoLoad("tierlists", () => fetchTierListsRows(demoSource(createPublicClient()))),
    getLatestVersion(),
  ]);

  const championMap = await getChampionMap(version);
  const championsById = new Map<number, TierChampion>(
    realChampions(championMap).map((c) => [c.championId, c]),
  );

  const entries = buildTierLists(tierListRows, new Set(championMap.keys()));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Tier Lists</h1>
        <p className="text-sm text-grey-light">
          Each player&apos;s own champion ranking, drawn by hand. Hover a champion for their
          record on it.
        </p>
        <p className="mt-1 text-sm text-grey-mid">
          Tier names are standardised for the demo; the rankings themselves are unchanged.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-grey-mid">No tier lists have been made yet.</p>
      ) : (
        <TierListsBoard
          entries={entries}
          championsById={championsById}
          version={version}
          actionsFor={({ player }) => (
            <DownloadPngButton
              targetId={`tierlist-${player.slug}`}
              fileName={`${player.slug}-tierlist.png`}
            />
          )}
        />
      )}
    </main>
  );
}
