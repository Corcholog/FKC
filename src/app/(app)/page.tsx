import { createClient } from "@/lib/supabase/server";
import { optional } from "@/lib/supabase/read";
import { getLatestVersion, getChampionMap } from "@/lib/ddragon";
import { formatRelativeTime } from "@/lib/format";
import { privateSource, type QueueScope } from "@/lib/data-source";
import { loadTeamGames } from "@/lib/team/queries";
import { loadTeamRoster } from "@/lib/team/roster";
import { loadTeamOverviewFlex } from "@/lib/loaders/team-overview";
import { fetchPlayerRecordRows } from "@/lib/loaders/players";
import { buildRosterBoard } from "@/lib/loaders/roster-board";
import { buildTeamHours } from "@/lib/loaders/team-hours";
import { formatWinRate } from "@/lib/rank";
import { formatHour } from "@/lib/time-stats";
import { TeamOverviewView } from "@/components/team/views/overview-view";
import { RosterBoard } from "@/components/team/roster-board";
import { HourBars } from "@/components/charts/hour-bars";
import { SectionCard } from "@/components/section-card";
import { TeamMatchEmptyState } from "@/components/team/team-match-empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// The team, at a glance.
//
// The roster board is the page's subject and sits at the top: the five of them,
// their record and their champion pool, over whichever games the filter picks.
// All four readings are folded server-side and handed over together, so the
// filter is a re-render rather than a round trip — see lib/loaders/roster-board.ts.
//
// Below it, the team's own record: scrims, friendlies, officials and flex
// counted together, with when they play beside it, then the recent series and
// who we have played.
//
// The hour chart is the one thing /insights was worth keeping (ADR-052), and it
// arrives here for free — it folds the rows the roster board already read.
export default async function HomePage() {
  const supabase = await createClient();

  // The team has to be resolved before the flex fold, which needs the set of
  // player ids to work out which side of each game was ours.
  const team = await loadTeamRoster(privateSource(supabase));
  const teamPlayerIds = new Set(team.map((m) => m.id));

  // Team games first, and once: both the roster board and the record below it
  // fold the same set, and loadTeamGames is four round trips.
  const games = await loadTeamGames(privateSource(supabase));

  const [flex, recordRows, syncStateResult, version] = await Promise.all([
    loadTeamOverviewFlex(supabase, teamPlayerIds),
    fetchPlayerRecordRows(
      (queue: QueueScope) => privateSource(supabase, queue),
      team.map((m) => m.id),
      games,
    ),
    supabase
      .from("sync_state")
      .select("riot_key_valid, last_sync_status, last_sync_finished_at")
      .eq("id", 1)
      .single(),
    getLatestVersion(),
  ]);

  // Chrome, not content — a missing sync banner is not worth losing the page for.
  const syncState = optional(syncStateResult, "sync state", null);
  const championMap = await getChampionMap(version);
  const board = buildRosterBoard(team, recordRows);
  const hours = buildTeamHours(team, [...recordRows.soloq, ...recordRows.flexq]);

  // The empty state is about the entry form, so it only applies when there is
  // nothing to enter *and* nothing arrived from Riot either. A team that has
  // played flex but typed no scrims still has a record worth rendering.
  const noTeamGames = games.length === 0 && flex.record.games === 0;

  // Soloq and flex only, and the caption says so: a scrim is dated to a day,
  // not a moment, so it has no hour to count — see lib/loaders/team-hours.ts.
  const whenWePlay = (
    <SectionCard
      title="When the team plays"
      caption="Solo queue and flex, in Buenos Aires time — a scrim records the day it was played, not the hour. Click a bar for who was in it."
    >
      <HourBars stats={hours.stats} breakdown={hours.breakdown} />

      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-sm text-grey-light">
        {hours.peakHour !== null && (
          <span>
            Peak hour: <span className="text-white">{formatHour(hours.peakHour)}</span>
          </span>
        )}
        {hours.lateNight.games > 0 && (
          <span>
            After midnight:{" "}
            <span className="tabular-nums text-white">
              {formatWinRate(hours.lateNight.wins, hours.lateNight.games - hours.lateNight.wins)}
            </span>{" "}
            <span className="text-xs text-grey-mid">
              ({hours.lateNight.games} game{hours.lateNight.games === 1 ? "" : "s"}) vs{" "}
              {formatWinRate(hours.daytime.wins, hours.daytime.games - hours.daytime.wins)} the
              rest of the day
            </span>
          </span>
        )}
      </div>
    </SectionCard>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-white">Team</h1>
          <p className="text-sm text-grey-light">
            Every game played as a team. Scrims, friendlies and tournament officials are
            entered by hand or read out of a replay, because Riot&apos;s API doesn&apos;t
            serve custom games; ranked flex comes from the API and sits beside them.
          </p>
        </div>

        {syncState && (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-xs tracking-wide text-grey-light uppercase">
                Sync status
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Badge
                variant="outline"
                className={
                  syncState.riot_key_valid
                    ? "self-start border-win/40 text-win"
                    : "self-start border-warning/40 text-warning"
                }
              >
                {syncState.riot_key_valid ? "Riot key valid" : "Riot key invalid/expired"}
              </Badge>
              <span className="text-grey-light">
                {syncState.last_sync_finished_at
                  ? `Last sync ${formatRelativeTime(syncState.last_sync_finished_at)}`
                  : "Never synced yet"}
              </span>
            </CardContent>
          </Card>
        )}
      </div>

      <RosterBoard board={board} version={version} championMap={championMap} />

      {noTeamGames ? (
        <>
          <TeamMatchEmptyState canAdd />
          {whenWePlay}
        </>
      ) : (
        <TeamOverviewView games={games} flex={flex} when={whenWePlay} />
      )}
    </main>
  );
}
