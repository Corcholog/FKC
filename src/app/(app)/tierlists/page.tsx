import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion, realChampions } from "@/lib/ddragon";
import { allChampionsByPlayer, type ChampionStatInput } from "@/lib/champion-stats";
import { formatRelativeTime } from "@/lib/format";
import { LOLALYTICS_LANES, mainLane } from "@/lib/lolalytics";
import { normalizeTiers, statMap, type Tier, type TierChampion } from "@/lib/tierlist";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// A Link styled as a button, not a Button rendering a Link — base-ui's Button
// wants a real <button> underneath. Same approach as matches-pagination.tsx.
import { buttonVariants } from "@/components/ui/button";
import { DeleteTierListButton } from "@/components/tierlist/delete-tier-list-button";
import { DownloadPngButton } from "@/components/tierlist/download-png-button";
import { TierListExportNode } from "@/components/tierlist/tier-list-export-node";
import { TierListView } from "@/components/tierlist/tier-list-view";

type PlayerRow = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  user_id: string | null;
};

type TierListRow = {
  player_id: string;
  tiers: unknown;
  updated_at: string;
  updated_by: string | null;
};

export default async function TierListsPage() {
  const supabase = await createClient();

  const [{ data: players }, { data: lists }] = await Promise.all([
    // Only players with a login, not the whole tracked roster. A tier list is
    // somebody's opinion, so it needs somebody to hold it — the accounts we
    // track but nobody sits behind (Agus, Hernan, …) have no opinions to
    // record. Filtering on user_id rather than a name list means a sixth person
    // getting a login from /settings shows up here on their own.
    supabase
      .from("players")
      .select("id, slug, display_name, avatar_url, user_id")
      .not("user_id", "is", null)
      .order("display_name")
      .returns<PlayerRow[]>(),
    supabase
      .from("champion_tier_lists")
      .select("player_id, tiers, updated_at, updated_by")
      .returns<TierListRow[]>(),
  ]);

  const version = await getLatestVersion();
  const championMap = await getChampionMap(version);
  const championsById = new Map<number, TierChampion>(
    realChampions(championMap).map((c) => [c.championId, c]),
  );
  const validChampionIds = new Set(championMap.keys());

  // Hover stats for every roster player in one pass, same shape the /champions
  // page builds for one.
  const { data: statRows } = await supabase
    .from("match_participants")
    .select(
      "player_id, team_position, champion_id, champion_name, win, kills, deaths, assists, total_cs, damage_dealt_to_champions, matches!inner(game_duration_seconds)",
    )
    .not("player_id", "is", null)
    .returns<
      (Omit<ChampionStatInput, "game_duration_seconds"> & {
        team_position: string | null;
        matches: { game_duration_seconds: number } | null;
      })[]
    >();

  const aggsByPlayer = allChampionsByPlayer(
    (statRows ?? []).map((r) => ({ ...r, game_duration_seconds: r.matches?.game_duration_seconds ?? 0 })),
  );

  // Down the page in team order — Top, Jungle, Mid, ADC, Support — rather than
  // alphabetically, so the list reads like a roster. Each player's lane is the
  // one they queue for most, the same call the navbar makes to prefill the
  // matchup lookup; LOLALYTICS_LANES is already in that order, so its index is
  // the sort key. Alphabetical is only the tie-break within a lane.
  const positionsByPlayer = new Map<string, (string | null)[]>();
  for (const row of statRows ?? []) {
    if (!row.player_id) continue;
    const positions = positionsByPlayer.get(row.player_id) ?? [];
    positions.push(row.team_position);
    positionsByPlayer.set(row.player_id, positions);
  }
  const laneRank = new Map(LOLALYTICS_LANES.map((lane, i) => [lane.value, i]));
  const laneLabel = new Map(LOLALYTICS_LANES.map((lane) => [lane.value, lane.label]));
  const laneOf = (playerId: string) => mainLane(positionsByPlayer.get(playerId) ?? []);
  const orderedPlayers = [...(players ?? [])].sort(
    (a, b) =>
      (laneRank.get(laneOf(a.id)) ?? 0) - (laneRank.get(laneOf(b.id)) ?? 0) ||
      a.display_name.localeCompare(b.display_name),
  );

  const listsByPlayer = new Map((lists ?? []).map((row) => [row.player_id, row]));
  // updated_by is an auth user id; the roster is the only place a name for it exists.
  const nameByUserId = new Map(
    (players ?? []).filter((p) => p.user_id).map((p) => [p.user_id as string, p.display_name]),
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Tier Lists</h1>
        <p className="text-sm text-grey-light">
          Everyone&apos;s hand-made champion ranking. Anyone can edit anyone&apos;s.
        </p>
      </div>

      {orderedPlayers.length === 0 ? (
        <p className="text-sm text-grey-mid">
          Nobody has a login yet — tier lists belong to accounts, which are created from
          Settings.
        </p>
      ) : (
        orderedPlayers.map((player) => {
          const row = listsByPlayer.get(player.id);
          const tiers: Tier[] = row ? normalizeTiers(row.tiers, validChampionIds) : [];
          const editedBy = row?.updated_by ? nameByUserId.get(row.updated_by) : undefined;
          const stats = statMap(aggsByPlayer.get(player.id) ?? []);

          return (
            <section key={player.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar size="lg">
                  {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
                  <AvatarFallback>{player.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="mr-auto">
                  <h2 className="font-heading text-lg font-semibold text-white">
                    {player.display_name}
                    {/* Named, not just implied by position — otherwise the
                        ordering down the page looks arbitrary. */}
                    <span className="ml-2 text-xs font-normal tracking-wide text-grey-mid uppercase">
                      {laneLabel.get(laneOf(player.id))}
                    </span>
                  </h2>
                  {row && (
                    <p className="text-xs text-grey-mid">
                      Edited {formatRelativeTime(row.updated_at)}
                      {editedBy ? ` by ${editedBy}` : ""}
                    </p>
                  )}
                </div>

                {row ? (
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
                    <DeleteTierListButton
                      playerId={player.id}
                      playerName={player.display_name}
                    />
                  </div>
                ) : (
                  <Link
                    href={`/tierlists/${player.slug}`}
                    className={cn(buttonVariants({ size: "sm" }))}
                  >
                    <Plus />
                    Create tier list
                  </Link>
                )}
              </div>

              {row ? (
                <>
                  <TierListView
                    tiers={tiers}
                    champions={championsById}
                    version={version}
                    stats={stats}
                  />
                  <TierListExportNode
                    id={`tierlist-${player.slug}`}
                    title={`${player.display_name} — champion tier list`}
                    subtitle={`Patch ${version}`}
                    tiers={tiers}
                    champions={championsById}
                    version={version}
                  />
                </>
              ) : (
                <div className="panel-hex p-6 text-center">
                  <p className="text-sm text-grey-mid">
                    {player.display_name}{" "} hasn&apos;t made a tier list yet.
                  </p>
                </div>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}
