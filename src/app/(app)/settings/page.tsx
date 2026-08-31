import { createClient } from "@/lib/supabase/server";
import { rows } from "@/lib/supabase/read";
import { AddPlayerForm } from "@/components/settings/add-player-form";
import { PlayerRow, type SettingsPlayer } from "@/components/settings/player-row";
import type { PlayerAccount } from "@/components/settings/player-accounts";
import { SectionCard } from "@/components/section-card";

// Everyone this app tracks, and the Riot accounts behind them.
//
// The friend group, not the main team — five of these people are also that, and
// which five is the next tab. Everything under /team reads players.team_role;
// everything else reads all of them.
export default async function SettingsRosterPage() {
  const supabase = await createClient();

  // The roster read is the one that matters here: this page is where players are
  // added and deleted, so an empty list rendered because the read failed reads
  // as "the roster is gone" on the exact page where someone would try to fix it.
  const players = rows(
    await supabase
      .from("players")
      .select(
        "id, riot_game_name, riot_tag_line, display_name, avatar_url, user_id, " +
          "ai_context, team_role",
      )
      .order("display_name")
      // Spelled out because the column list is a concatenation, which PostgREST's
      // type inference can't read — without this the rows come back as
      // GenericStringError and every field access below is an error.
      .returns<SettingsPlayer[]>(),
    "roster",
  );

  // Every account, grouped by owner below. Read unconditionally rather than per
  // row: nine players is nine round trips otherwise.
  const accounts = rows(
    await supabase
      .from("player_accounts")
      .select(
        "puuid, player_id, riot_game_name, riot_tag_line, platform, is_primary, " +
          "track_solo, track_flex, tier, division, league_points, flex_tier",
      )
      // Primary first, then alphabetically — so the account whose Riot ID the
      // player is shown under leads their list.
      .order("is_primary", { ascending: false })
      .order("riot_game_name")
      .returns<PlayerAccount[]>(),
    "player accounts",
  );

  const accountsByPlayer = new Map<string, PlayerAccount[]>();
  for (const account of accounts) {
    const list = accountsByPlayer.get(account.player_id);
    if (list) list.push(account);
    else accountsByPlayer.set(account.player_id, [account]);
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Add player">
        <AddPlayerForm />
      </SectionCard>

      <SectionCard title={`Roster (${players.length})`}>
        {players.length === 0 ? (
          <p className="text-sm text-grey-mid">No players tracked yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                accounts={accountsByPlayer.get(player.id) ?? []}
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
