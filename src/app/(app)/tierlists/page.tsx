import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { buildTierLists, fetchTierListsRows } from "@/lib/loaders/tierlists";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import type { TierChampion } from "@/lib/tierlist";
import { cn } from "@/lib/utils";
// A Link styled as a button, not a Button rendering a Link — base-ui's Button
// wants a real <button> underneath. Same approach as matches-pagination.tsx.
import { buttonVariants } from "@/components/ui/button";
import { DeleteTierListButton } from "@/components/tierlist/delete-tier-list-button";
import { DownloadPngButton } from "@/components/tierlist/download-png-button";
import { TierListsBoard } from "@/components/tierlist/tier-lists-board";

export default async function TierListsPage() {
  const supabase = await createClient();

  const [tierListRows, version] = await Promise.all([
    fetchTierListsRows(privateSource(supabase)),
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
          Everyone&apos;s hand-made champion ranking. Anyone can edit anyone&apos;s.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-grey-mid">
          Nobody has a login yet — tier lists belong to accounts, which are created from Settings.
        </p>
      ) : (
        <TierListsBoard
          entries={entries}
          championsById={championsById}
          version={version}
          actionsFor={({ player, list }) =>
            list ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/tierlists/${player.slug}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <Pencil />
                  Edit
                </Link>
                <DownloadPngButton
                  targetId={`tierlist-${player.slug}`}
                  fileName={`${player.slug}-tierlist.png`}
                />
                <DeleteTierListButton playerId={player.id} playerName={player.display_name} />
              </div>
            ) : (
              <Link href={`/tierlists/${player.slug}`} className={cn(buttonVariants({ size: "sm" }))}>
                <Plus />
                Create tier list
              </Link>
            )
          }
        />
      )}
    </main>
  );
}
