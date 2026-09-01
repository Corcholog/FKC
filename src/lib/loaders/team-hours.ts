// When the team plays, folded from rows the front page already has.
//
// This is the one thing /insights was worth keeping (ADR-052), and it costs no
// query here: the roster board reads every tracked game for all five players to
// build its cards, and this folds the same array a second time.
//
// **Riot rows only.** A team match is dated to a day, not a moment — nobody
// records what time a scrim kicked off — so `fromTeamPick` stamps it at midday
// to keep it sorting into the right day (see unified.ts). Folding those into a
// chart about hours would invent a spike at 09:00 Buenos Aires out of nothing,
// which is exactly the kind of plausible-looking wrong number the null-not-zero
// rule exists to prevent. They are dropped here rather than by the caller so the
// reason travels with the code.
//
// Pure: no I/O, no React.

import {
  aggregateByTime,
  busiestHour,
  lateNightRecord,
  playersByHour,
  type HourStats,
  type TimeBucket,
} from "@/lib/time-stats";
import type { UnifiedRow } from "@/lib/unified";
import type { TeamMember } from "@/lib/team/roster";
import type { RankRow } from "@/components/stat-ranking";

export type TeamHours = {
  stats: HourStats;
  /** Hour → who was in it, most games first. What a clicked bar opens. */
  breakdown: Record<number, RankRow[]>;
  peakHour: number | null;
  lateNight: TimeBucket;
  /** The comparison the late-night number only means something against. */
  daytime: TimeBucket;
};

export function buildTeamHours(team: TeamMember[], rows: UnifiedRow[]): TeamHours {
  const timed = rows.filter((row) => row.source !== "team");
  const stats = aggregateByTime(timed);
  const lateNight = lateNightRecord(stats);

  // A bar's height is a roster-wide total, which is exactly the shape of number
  // somebody reads and thinks "that isn't me". Names and hrefs are resolved
  // here so the chart never holds a player-id lookup.
  const byId = new Map(team.map((member) => [member.id, member]));
  const breakdown: Record<number, RankRow[]> = {};
  for (const [hour, records] of playersByHour(timed)) {
    breakdown[hour] = records.map((record) => {
      const member = byId.get(record.ownerId);
      return {
        id: record.ownerId,
        name: member?.display_name ?? "Unknown",
        avatarUrl: member?.avatar_url ?? null,
        href: member ? `/players/${member.slug}` : undefined,
        value: `${record.games}g`,
        sub: `${record.wins}W / ${record.games - record.wins}L`,
      };
    });
  }

  return {
    stats,
    breakdown,
    peakHour: busiestHour(stats),
    lateNight,
    daytime: {
      games: stats.totalGames - lateNight.games,
      wins: stats.byHour.reduce((sum, bucket) => sum + bucket.wins, 0) - lateNight.wins,
    },
  };
}
