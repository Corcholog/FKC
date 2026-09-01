import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { groupBySeries } from "@/lib/team/queries";
import type { TeamOverviewFlex } from "@/lib/loaders/team-overview";
import {
  overallRecord,
  recordByKind,
  recordByOpponent,
} from "@/lib/team/stats";
import { TEAM_MATCH_KIND_LABELS, seriesLabel, type TeamGameView } from "@/lib/team/types";
import { WinrateRing } from "@/components/winrate-ring";
import { MetaChip, SeriesScore } from "@/components/team/ui";

// The team section's front page — /team.
//
// Two sources, counted together and shown apart. Team matches (scrims,
// friendlies, officials) have an opponent and a draft; flex is a Riot queue
// with none of that, but a full-stack flex game is the same five people
// playing the same game, so it belongs in the same record.
//
// Flex is optional rather than required, and that is deliberate: it is a second
// query, and a page that renders without it is still a correct page about team
// matches. Passing null says "not loaded", which reads differently from a
// record of 0-0.
//
// The roster it takes is only ever used to put a face and a link on a name the
// aggregate already resolved.
export type TeamRosterRow = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
};

export function TeamOverviewView({
  games,
  flex = null,
  when,
}: {
  games: TeamGameView[];
  /** Null when flex wasn't loaded — see the header. */
  flex?: TeamOverviewFlex | null;
  /**
   * When the team plays, beside the record.
   *
   * A slot rather than data, because it folds rows this view never sees — the
   * roster board's, which are per player rather than per game. The two answer
   * "how it goes" and "when it happens" about the same season, which is why
   * they sit in one row.
   */
  when?: React.ReactNode;
}) {
  const overall = overallRecord(games);
  const kinds = recordByKind(games);
  const opponents = recordByOpponent(games);
  const allSeries = groupBySeries(games);
  const recentSeries = allSeries.slice(0, 5);

  // The combined record: team matches plus flex. Every stored flex game is one
  // the team played as a five, so there is nothing to leave out here — the sync
  // already did (lib/team/roster.ts).
  const combinedGames = overall.games + (flex?.record.games ?? 0);
  const combinedWins = overall.wins + (flex?.record.wins ?? 0);
  const combinedWinRate =
    combinedGames === 0 ? 0 : Math.round((combinedWins / combinedGames) * 100);

  return (
    <div className="flex flex-col gap-8">
      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="panel-hex panel-hex-clip flex items-center gap-4 p-5">
          <WinrateRing
            percentage={flex ? combinedWinRate : overall.winRate}
            size={72}
            strokeWidth={6}
          />
          <div className="min-w-0">
            <p className="font-heading text-3xl leading-none font-semibold tabular-nums text-white">
              {flex ? combinedWins : overall.wins}
              <span className="text-grey-mid">–</span>
              {flex ? combinedGames - combinedWins : overall.losses}
            </p>
            <p className="mt-1 text-sm text-grey-light">
              {flex
                ? `${combinedGames} game${combinedGames === 1 ? "" : "s"} as a team`
                : `${overall.games} game${overall.games === 1 ? "" : "s"} across ${allSeries.length} series`}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {kinds.map(({ kind, record }) => (
                <MetaChip key={kind}>
                  {TEAM_MATCH_KIND_LABELS[kind]} {record.wins}–{record.losses}
                </MetaChip>
              ))}
              {flex && flex.record.games > 0 && (
                <MetaChip>
                  Flex {flex.record.wins}–{flex.record.losses}
                </MetaChip>
              )}
            </div>
          </div>
        </div>

        {when}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold text-white">Recent series</h2>
            <Link
              href={`/matches`}
              className="flex items-center gap-0.5 text-sm text-grey-light transition-colors hover:text-gold-bright"
            >
              All history
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {recentSeries.map((entry) => {
              const wins = entry.games.filter((g) => g.win).length;
              return (
                <Link
                  key={entry.series.id}
                  href={`/matches/${entry.series.id}`}
                  className="panel-hex is-interactive flex items-center gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{entry.opponent.name}</p>
                    <p className="text-xs text-grey-mid">
                      {entry.series.played_on}
                      <span className="mx-1 opacity-50">·</span>
                      {seriesLabel(entry.series, entry.competition)}
                      {entry.series.fearless ? " · Fearless" : ""}
                    </p>
                  </div>
                  <SeriesScore wins={wins} losses={entry.games.length - wins} />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold text-white">Head to head</h2>
            <Link
              href={`/prep/opponents`}
              className="flex items-center gap-0.5 text-sm text-grey-light transition-colors hover:text-gold-bright"
            >
              Scouting
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {opponents.map((opponent) => (
              <Link
                key={opponent.opponentId}
                href={`/prep/opponents/${opponent.slug}`}
                className="panel-hex is-interactive flex items-center gap-3 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{opponent.name}</p>
                  <p className="text-xs text-grey-mid">
                    {opponent.seriesCount} series
                    <span className="mx-1 opacity-50">·</span>
                    {opponent.record.games} game{opponent.record.games === 1 ? "" : "s"}
                  </p>
                </div>
                <SeriesScore wins={opponent.record.wins} losses={opponent.record.losses} />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
