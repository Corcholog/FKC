import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatKdaRatio } from "@/lib/format";
import { formatRole, mainRole } from "@/lib/roles";
import { avatarTint } from "@/lib/avatar-tint";
import { groupBySeries } from "@/lib/scrims/queries";
import {
  aggregateAllyPlayers,
  overallRecord,
  recordByKind,
  recordByOpponent,
  recordBySide,
  scrimCsPerMinute,
  scrimKdaRatio,
  scrimWinRate,
  type ScrimRecord,
} from "@/lib/scrims/team-stats";
import { SCRIM_KIND_LABELS, type ScrimGameView } from "@/lib/scrims/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { WinrateRing } from "@/components/winrate-ring";
import { MetaChip, SeriesScore, winRateTone } from "@/components/scrims/scrim-ui";
import { cn } from "@/lib/utils";

// The scrim section's front page — /scrims and its demo.
//
// The roster it takes is only ever used to put a face and a link on a name that
// the aggregate already resolved, so both versions pass the same shape: on the
// demo it comes from demo_players, where display_name is the alias and
// avatar_url is always null.
export type ScrimsRosterRow = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
};

/**
 * A record as a proportional win/loss bar.
 *
 * Two numbers side by side make you do the division; a bar doesn't. Used for
 * the side split, where the whole question is "are we better on one side", and
 * that's a comparison of shapes.
 */
function RecordBar({
  label,
  record,
  tone,
}: {
  label: string;
  record: ScrimRecord;
  tone: "blue" | "red";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "text-xs font-medium tracking-wide uppercase",
            tone === "blue" ? "text-cyan" : "text-loss",
          )}
        >
          {label}
        </span>
        <span className="text-xs tabular-nums text-grey-light">
          {record.games === 0 ? (
            <span className="text-grey-mid">No games</span>
          ) : (
            <>
              {record.wins}–{record.losses}
              <span className={cn("ml-1.5", winRateTone(record.winRate))}>{record.winRate}%</span>
            </>
          )}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
        <span className="bg-win transition-[width]" style={{ width: `${record.games === 0 ? 0 : (record.wins / record.games) * 100}%` }} />
        <span className="bg-loss/60 transition-[width]" style={{ width: `${record.games === 0 ? 0 : (record.losses / record.games) * 100}%` }} />
      </div>
    </div>
  );
}

export function ScrimsOverviewView({
  games,
  roster,
  basePath = "",
}: {
  games: ScrimGameView[];
  roster: ScrimsRosterRow[];
  basePath?: string;
}) {
  const rosterById = new Map(roster.map((p) => [p.id, p]));
  const displayNames = new Map(roster.map((p) => [p.id, p.display_name]));

  const overall = overallRecord(games);
  const sides = recordBySide(games);
  const kinds = recordByKind(games);
  const opponents = recordByOpponent(games);
  const players = aggregateAllyPlayers(games, displayNames);
  const allSeries = groupBySeries(games);
  const recentSeries = allSeries.slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      {/* Headline: the record, then the split that explains it. */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="panel-hex panel-hex-clip flex items-center gap-4 p-5">
          <WinrateRing percentage={overall.winRate} size={72} strokeWidth={6} />
          <div className="min-w-0">
            <p className="font-heading text-3xl leading-none font-semibold tabular-nums text-white">
              {overall.wins}
              <span className="text-grey-mid">–</span>
              {overall.losses}
            </p>
            <p className="mt-1 text-sm text-grey-light">
              {overall.games} game{overall.games === 1 ? "" : "s"} across {allSeries.length} series
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {kinds.map(({ kind, record }) => (
                <MetaChip key={kind}>
                  {SCRIM_KIND_LABELS[kind]} {record.wins}–{record.losses}
                </MetaChip>
              ))}
            </div>
          </div>
        </div>

        <div className="panel-hex flex flex-col justify-center gap-4 p-5">
          <RecordBar label="Blue side" record={sides.blue} tone="blue" />
          <RecordBar label="Red side" record={sides.red} tone="red" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-white">Players</h2>
        <div className="panel-hex overflow-x-auto">
          <table className="w-full min-w-lg text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-wider text-grey-mid uppercase">
                <th className="px-4 py-2 font-medium">Player</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 text-right font-medium">Games</th>
                <th className="px-4 py-2 text-right font-medium">Record</th>
                <th className="px-4 py-2 text-right font-medium">KDA</th>
                <th className="px-4 py-2 text-right font-medium">CS/min</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const rosterRow = player.playerId ? rosterById.get(player.playerId) : undefined;
                // The role they actually played across these games, not their
                // soloq main — someone can be the scrim support and a soloq mid.
                const role = mainRole(
                  [...player.positions.entries()].flatMap(([position, count]) =>
                    Array<string>(count).fill(position),
                  ),
                );
                const csPerMin = scrimCsPerMinute(player);
                const winRate = scrimWinRate(player);

                return (
                  <tr
                    key={player.playerId ?? player.name}
                    className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-tertiary/40"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          {rosterRow?.avatar_url && <AvatarImage src={rosterRow.avatar_url} alt="" />}
                          <AvatarFallback style={avatarTint(player.name)}>
                            {player.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {rosterRow ? (
                          <Link
                            href={`${basePath}/player/${rosterRow.slug}`}
                            className="truncate text-grey-light transition-colors hover:text-gold-bright"
                          >
                            {player.name}
                          </Link>
                        ) : (
                          <span className="truncate text-grey-light">
                            {player.name}
                            <span className="ml-1 text-xs text-grey-mid">(sub)</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-grey-mid">{formatRole(role)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-grey-light">
                      {player.games}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-grey-light">
                      {player.wins}–{player.games - player.wins}
                      <span className={cn("ml-1.5 text-xs", winRateTone(winRate))}>{winRate}%</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-grey-light">
                      {formatKdaRatio(scrimKdaRatio(player))}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-grey-light">
                      {csPerMin === null ? (
                        <span className="text-grey-mid" title="No game recorded a duration">
                          —
                        </span>
                      ) : (
                        csPerMin.toFixed(1)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold text-white">Recent series</h2>
            <Link
              href={`${basePath}/scrims/history`}
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
                  href={`${basePath}/scrims/${entry.series.id}`}
                  className="panel-hex is-interactive flex items-center gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{entry.opponent.name}</p>
                    <p className="text-xs text-grey-mid">
                      {entry.series.played_on}
                      <span className="mx-1 opacity-50">·</span>
                      {SCRIM_KIND_LABELS[entry.series.kind]}
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
              href={`${basePath}/scrims/opponents`}
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
                href={`${basePath}/scrims/opponents/${opponent.slug}`}
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
