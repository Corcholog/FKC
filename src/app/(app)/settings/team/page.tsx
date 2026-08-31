import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { rows } from "@/lib/supabase/read";
import { formatRole } from "@/lib/roles";
import { avatarTint } from "@/lib/avatar-tint";
import { FULL_STACK, isTeamMember, sortTeamMembers } from "@/lib/team/roster";
import { TeamRoleSelect } from "@/components/settings/team-role-select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionCard } from "@/components/section-card";
import { cn } from "@/lib/utils";

type RosterRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  team_role: string | null;
};

type FlexAccount = {
  puuid: string;
  player_id: string;
  riot_game_name: string;
  riot_tag_line: string;
  track_flex: boolean;
};

/**
 * How many accounts have to be walked to find every game the team plays.
 *
 * A qualifying flex game contains five of the team, so it can leave out at most
 * `size - 5` of them — which means `size - 4` accounts between them are in every
 * possible lineup. At exactly five people that is **one**: every one of them is
 * in every game, so walking the other four re-reads the same list of match ids.
 */
function scoutsNeeded(teamSize: number): number {
  return Math.max(1, teamSize - FULL_STACK + 1);
}

export default async function SettingsTeamPage() {
  const supabase = await createClient();

  const [players, accounts] = await Promise.all([
    supabase
      .from("players")
      .select("id, display_name, avatar_url, team_role")
      .order("display_name")
      .returns<RosterRow[]>(),
    supabase
      .from("player_accounts")
      .select("puuid, player_id, riot_game_name, riot_tag_line, track_flex")
      .order("riot_game_name")
      .returns<FlexAccount[]>(),
  ]);

  const roster = rows(players, "roster");
  const allAccounts = rows(accounts, "player accounts");

  const members = sortTeamMembers(roster.filter(isTeamMember));
  const others = roster.filter((p) => !isTeamMember(p));
  const namesById = new Map(roster.map((p) => [p.id, p.display_name]));

  const scouts = allAccounts.filter((a) => a.track_flex);
  const needed = scoutsNeeded(members.length);
  const short = members.length < FULL_STACK;

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title={`Main team (${members.length}/${FULL_STACK})`}
        caption="Everything under /team reads this — the record, the charts, the champion pools, and which flex games the sync keeps. Everywhere else counts the whole roster."
      >
        {short && (
          <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
            Flex is only stored for games the main team played, so with fewer than {FULL_STACK}{" "}
            positions assigned no flex game can qualify — the sync skips the queue entirely
            rather than spending a Riot call on each game to reject it.
          </p>
        )}

        <ul className="flex flex-col gap-1.5">
          {[...members, ...others].map((player) => (
            <li
              key={player.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-2.5",
                isTeamMember(player)
                  ? "border-gold-muted bg-bg-tertiary/60"
                  : "border-border bg-bg-tertiary",
              )}
            >
              <Avatar size="sm">
                {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
                <AvatarFallback style={avatarTint(player.display_name)}>
                  {player.display_name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{player.display_name}</p>
                <p className="truncate text-[10px] font-semibold tracking-wider text-grey-mid uppercase">
                  {player.team_role ? formatRole(player.team_role) : "Friend group only"}
                </p>
              </div>
              <TeamRoleSelect playerId={player.id} role={player.team_role} />
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Flex discovery"
        caption="Which accounts the sync walks for ranked flex. Toggle it per account on the Roster tab."
      >
        {scouts.length === 0 ? (
          <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
            No account is tracked for flex, so no flex game will ever arrive — and nothing else
            in the app would say so. Turn on FlexQ for one of the team&apos;s accounts in{" "}
            <Link href="/settings" className="underline">
              Roster
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {scouts.map((account) => (
              <li
                key={account.puuid}
                className="flex items-center justify-between gap-3 rounded-md bg-bg-tertiary px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-grey-light">
                  {account.riot_game_name}
                  <span className="text-grey-mid">#{account.riot_tag_line}</span>
                </span>
                <span className="shrink-0 text-xs text-grey-mid">
                  {namesById.get(account.player_id) ?? "Unknown player"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* The redundancy note. Not an error — it costs calls, not correctness —
            but it is invisible otherwise, and on a 100-request key four wasted
            id-page calls a run is real money during a backfill. */}
        {scouts.length > needed && (
          <p className="text-xs text-grey-mid">
            {needed === 1
              ? `Every flex game the team plays has all ${FULL_STACK} of them in it, so one tracked account finds all of them. The other ${scouts.length - needed} re-read the same list of match ids every run.`
              : `With ${members.length} on the team, ${needed} tracked accounts cover every possible lineup. The other ${scouts.length - needed} find nothing new.`}{" "}
            The best one to keep is whichever account plays flex <em>only</em> with the team —
            every game that isn&apos;t theirs still costs a call to find that out.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
