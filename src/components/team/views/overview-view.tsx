import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatKdaRatio } from "@/lib/format";
import { formatRole, mainRole } from "@/lib/roles";
import { avatarTint } from "@/lib/avatar-tint";
import { groupBySeries } from "@/lib/team/queries";
import type { TeamOverviewFlex } from "@/lib/loaders/team-overview";
import { FULL_STACK } from "@/lib/flex-team";
import type { TeamMember } from "@/lib/team/roster";
import { playerWinRate, kdaRatio } from "@/lib/player-stats";
import {
  aggregateAllyPlayers,
  overallRecord,
  recordByKind,
  recordByOpponent,
  recordBySide,
  teamCsPerMinute,
  teamKdaRatio,
  teamWinRate,
  type TeamRecord,
} from "@/lib/team/stats";
import { TEAM_MATCH_KIND_LABELS,
  seriesLabel, type TeamGameView } from "@/lib/team/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { WinrateRing } from "@/components/winrate-ring";
import { MetaChip, SeriesScore, winRateTone } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// The team section's front page — /team and its demo.
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
// The roster it takes is only ever used to put a face and a link on a name that
// the aggregate already resolved, so both versions pass the same shape: on the
// demo it comes from demo_players, where display_name is the alias and
// avatar_url is always null.
export type TeamRosterRow = {
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
  record: TeamRecord;
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

/**
 * Ranked flex: the record, and who actually turns up for it.
 *
 * The record is over full-stack games only. Everything else flex produces gets
 * counted and named rather than folded in, because each is a different claim:
 * a three-stack is some of the roster playing flex, and a civil war has no team
 * result at all. lib/flex-team.ts is where that split lives.
 */
function FlexSection({
  flex,
  roster,
  basePath,
}: {
  flex: TeamOverviewFlex;
  roster: Map<string, TeamRosterRow>;
  basePath: string;
}) {
  const { record, split, byPlayer, appearances } = flex;

  if (record.games === 0 && split.partial.length === 0 && split.civilWars.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-white">Flex queue</h2>
        <p className="panel-hex p-5 text-sm text-grey-mid">
          No flex games recorded yet. They arrive with the next sync — flex is tracked from
          June, and the first backfill takes a few runs.
        </p>
      </section>
    );
  }

  // Most flex first, then best record. Somebody with two games shouldn't lead
  // the list of who plays flex just because both went well.
  const players = [...byPlayer.entries()]
    .map(([playerId, agg]) => ({ playerId, agg, stacks: appearances.get(playerId) ?? 0 }))
    .sort((a, b) => b.agg.games - a.agg.games || b.agg.wins - a.agg.wins);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold text-white">Flex queue</h2>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="panel-hex panel-hex-clip flex items-center gap-4 p-5">
          <WinrateRing percentage={record.winRate} size={64} strokeWidth={6} />
          <div className="min-w-0">
            <p className="font-heading text-2xl leading-none font-semibold tabular-nums text-white">
              {record.wins}
              <span className="text-grey-mid">–</span>
              {record.losses}
            </p>
            <p className="mt-1 text-sm text-grey-light">
              {record.games} game{record.games === 1 ? "" : "s"} as a full {FULL_STACK}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {split.partial.length > 0 && (
                <MetaChip>{split.partial.length} part-stack</MetaChip>
              )}
              {split.civilWars.length > 0 && (
                <MetaChip>{split.civilWars.length} civil war</MetaChip>
              )}
            </div>
          </div>
        </div>

        <div className="panel-hex overflow-x-auto">
          <table className="w-full min-w-md text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-wider text-grey-mid uppercase">
                <th className="px-4 py-2 font-medium">Player</th>
                <th className="px-4 py-2 text-right font-medium">Games</th>
                <th className="px-4 py-2 text-right font-medium">Full {FULL_STACK}</th>
                <th className="px-4 py-2 text-right font-medium">Win rate</th>
                <th className="px-4 py-2 text-right font-medium">KDA</th>
              </tr>
            </thead>
            <tbody>
              {players.map(({ playerId, agg, stacks }) => {
                const player = roster.get(playerId);
                return (
                  <tr
                    key={playerId}
                    className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-tertiary/40"
                  >
                    <td className="px-4 py-2">
                      {player ? (
                        <Link
                          href={`${basePath}/player/${player.slug}`}
                          className="text-white transition-colors hover:text-gold-bright"
                        >
                          {player.display_name}
                        </Link>
                      ) : (
                        <span className="text-grey-light">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-grey-light">
                      {agg.games}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-grey-light">{stacks}</td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right tabular-nums",
                        winRateTone(playerWinRate(agg)),
                      )}
                    >
                      {playerWinRate(agg)}%
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-grey-light">
                      {formatKdaRatio(kdaRatio(agg))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Said out loud because the two numbers in this section count different
          things, and a reader who assumes otherwise gets a wrong answer rather
          than a confusing one. */}
      <p className="text-xs text-grey-mid">
        The record counts games the full {FULL_STACK} played together. The table counts every
        flex game each player was in.
      </p>
    </section>
  );
}

/**
 * The five, in role order — the answer to "who is this page about".
 *
 * Roster-driven rather than games-driven, and that is the whole reason
 * migration 026 exists: everything else on this page is folded out of games, so
 * a player who hasn't played one is invisible to it. "Our support has played
 * nothing this split" is information, and this is the only panel that can say
 * it.
 */
function Lineup({
  team,
  basePath,
}: {
  team: TeamMember[];
  basePath: string;
}) {
  if (team.length === 0) {
    return (
      <section className="panel-hex p-4">
        <p className="text-sm text-grey-mid">
          No main team assigned yet — set each player&apos;s role in{" "}
          <Link href="/settings" className="text-gold-bright hover:text-gold">
            Settings
          </Link>{" "}
          and this section becomes the five of them.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-wrap gap-2">
      {team.map((member) => (
        <Link
          key={member.id}
          href={`${basePath}/player/${member.slug}`}
          className="panel-hex group flex min-w-0 flex-1 basis-36 items-center gap-2.5 p-3 transition-colors hover:border-gold-muted"
        >
          <Avatar size="sm">
            {member.avatar_url && <AvatarImage src={member.avatar_url} alt="" />}
            <AvatarFallback style={avatarTint(member.display_name)}>
              {member.display_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white transition-colors group-hover:text-gold-bright">
              {member.display_name}
            </p>
            <p className="truncate text-[10px] font-semibold tracking-wider text-grey-mid uppercase">
              {formatRole(member.team_role)}
            </p>
          </div>
        </Link>
      ))}
    </section>
  );
}

export function TeamOverviewView({
  games,
  roster,
  team = [],
  flex = null,
  basePath = "",
}: {
  games: TeamGameView[];
  /**
   * Every player, for putting a face and a link on a name the aggregates
   * already resolved. Deliberately the wide list: a substitute who played a
   * scrim is on it, and narrowing it to the main team would render them as
   * "Unknown" rather than leaving them out.
   */
  roster: TeamRosterRow[];
  /** The main team itself (players.team_role), in role order. */
  team?: TeamMember[];
  /** Null when flex wasn't loaded — see the header. */
  flex?: TeamOverviewFlex | null;
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

  // The combined record: team matches plus the flex games the full roster
  // played. Partial stacks and civil wars are deliberately out — see
  // lib/flex-team.ts for why each would be a different claim.
  const combinedGames = overall.games + (flex?.record.games ?? 0);
  const combinedWins = overall.wins + (flex?.record.wins ?? 0);
  const combinedWinRate =
    combinedGames === 0 ? 0 : Math.round((combinedWins / combinedGames) * 100);

  return (
    <div className="flex flex-col gap-8">
      <Lineup team={team} basePath={basePath} />

      {/* Headline: the record, then the split that explains it. */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
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

        <div className="panel-hex flex flex-col justify-center gap-4 p-5">
          <RecordBar label="Blue side" record={sides.blue} tone="blue" />
          <RecordBar label="Red side" record={sides.red} tone="red" />
          {/* Team matches only. In flex the side is assigned, so folding it in
              would dilute the one split in this app where side is a choice the
              team prepared for — the argument side-stats.ts makes at length. */}
          {flex && flex.record.games > 0 && (
            <p className="text-xs text-grey-mid">Team matches only — flex sides are assigned.</p>
          )}
        </div>
      </section>

      {flex && <FlexSection flex={flex} roster={rosterById} basePath={basePath} />}

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
                const csPerMin = teamCsPerMinute(player);
                const winRate = teamWinRate(player);

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
                      {formatKdaRatio(teamKdaRatio(player))}
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
              href={`${basePath}/team/matches`}
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
                  href={`${basePath}/team/matches/${entry.series.id}`}
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
              href={`${basePath}/team/opponents`}
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
                href={`${basePath}/team/opponents/${opponent.slug}`}
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
