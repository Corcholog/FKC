import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { maybeRow, rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { allChampionsByPlayer, type ChampionStatInput } from "@/lib/champion-stats";
import { defaultTiers, normalizeTiers, statMap, type TierChampion } from "@/lib/tierlist";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// A Link styled as a button, not a Button rendering a Link — base-ui's Button
// wants a real <button> underneath. Same approach as matches-pagination.tsx.
import { buttonVariants } from "@/components/ui/button";
import { TierListEditor } from "@/components/tierlist/tier-list-editor";

type PlayerRow = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  user_id: string | null;
};

export default async function TierListEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const player = maybeRow(
    await supabase
      .from("players")
      .select("id, slug, display_name, avatar_url, user_id")
      .eq("slug", slug)
      .maybeSingle<PlayerRow>(),
    "player",
  );

  // Same rule the overview lists by, enforced here too so a tracked account
  // with no login can't get a tier list by someone typing the URL. maybeRow
  // above keeps a failed read out of this branch — otherwise a blip renders as
  // "no such player".
  if (!player || !player.user_id) notFound();

  const [tierListResult, statRowsResult] = await Promise.all([
    supabase
      .from("champion_tier_lists")
      .select("tiers")
      .eq("player_id", player.id)
      .maybeSingle<{ tiers: unknown }>(),
    supabase
      .from("match_participants")
      .select(
        "player_id, champion_id, champion_name, win, kills, deaths, assists, total_cs, damage_dealt_to_champions, matches!inner(game_duration_seconds)",
      )
      .eq("player_id", player.id)
      .returns<
        (Omit<ChampionStatInput, "game_duration_seconds"> & {
          matches: { game_duration_seconds: number } | null;
        })[]
      >(),
  ]);

  const row = maybeRow(tierListResult, "tier list");
  const statRows = rows(statRowsResult, "champion stats");

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);
  const champions: TierChampion[] = realChampions(championMap);

  // A missing row isn't an error — it's a blank list, seeded with S through D
  // so there's something to drag onto straight away.
  const tiers = row ? normalizeTiers(row.tiers, new Set(championMap.keys())) : defaultTiers();

  const aggs =
    allChampionsByPlayer(
      statRows.map((r) => ({
        ...r,
        game_duration_seconds: r.matches?.game_duration_seconds ?? 0,
      })),
    ).get(player.id) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/tierlists"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft />
          <span className="sr-only">Back to tier lists</span>
        </Link>
        <Avatar size="lg">
          {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
          <AvatarFallback>{player.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="font-heading text-2xl font-semibold text-white">
            {player.display_name}&apos;s tier list
          </h1>
          <p className="text-sm text-grey-light">
            {row ? "Editing a saved list." : "New list — nothing is stored until you save."}
          </p>
        </div>
      </div>

      <TierListEditor
        playerId={player.id}
        playerName={player.display_name}
        playerSlug={player.slug}
        initialTiers={tiers}
        hasSavedList={Boolean(row)}
        champions={champions}
        version={version}
        stats={statMap(aggs)}
      />
    </main>
  );
}
