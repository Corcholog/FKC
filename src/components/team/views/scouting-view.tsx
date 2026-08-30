import { championDisplayName, type ChampionInfo } from "@/lib/ddragon";
import { formatRole } from "@/lib/roles";
import { DurationSplit } from "@/components/player/duration-split";
import { DurationCurve } from "@/components/charts/duration-curve";
import {
  aggregatePicksByRole,
  countBans,
  type ChampionPickAgg,
} from "@/lib/team/draft-stats";
import { applyTeamMatchFilter, isEmptyTeamMatchFilter, teamMatchFilterOptions, type TeamMatchFilter } from "@/lib/team/filters";
import { firstPickSplit, teamDurationSplit } from "@/lib/team/splits";
import { overallRecord, type TeamRecord } from "@/lib/team/stats";
import { groupBySeries } from "@/lib/team/queries";
import { TEAM_ROLES, type TeamGameView } from "@/lib/team/types";
import { ChampionIcon } from "@/components/champion-icon";
import { SectionCard } from "@/components/section-card";
import { TeamGameCard, type PlayerLookup } from "@/components/team/draft-board";
import { TeamFilterBar } from "@/components/team/team-filter-bar";
import { WinrateRing } from "@/components/winrate-ring";
import { BarRow, MetaChip, winRateTone } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// The team page — /team/scouting and its demo.
//
// The other four scrim pages each answer one question over every game ever
// recorded. This one answers *any* of those questions over a subset, which is
// what preparation actually looks like: not "how do we draft", but "how did we
// draft against this team, on this patch, when they had Maokai".
//
// So the filter is the page, and everything below it is a fold over the same
// filtered array — record, draft order, game length, both champion pools, both
// ban lists, and the games themselves. Nothing here re-queries; `loadTeamGames`
// already returned the section's whole dataset and `applyTeamMatchFilter` is a
// predicate over it.

type Champion = ChampionInfo & { championId: number };

const TOP_N = 10;

function RecordLine({ label, record }: { label: string; record: TeamRecord }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-grey-light">{label}</span>
      {record.games === 0 ? (
        <span className="text-xs text-grey-mid">No games</span>
      ) : (
        <span className="text-sm tabular-nums text-grey-light">
          {record.wins}–{record.losses}
          <span className={cn("ml-2", winRateTone(record.winRate))}>{record.winRate}%</span>
        </span>
      )}
    </div>
  );
}

function PickPool({
  role,
  champions,
  version,
  championMap,
}: {
  role: string;
  champions: ChampionPickAgg[] | undefined;
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  const list = (champions ?? []).slice(0, TOP_N);
  const max = list[0]?.games ?? 1;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-[10px] font-medium tracking-wider text-grey-mid uppercase">
        {formatRole(role)}
      </p>
      {list.length === 0 ? (
        <p className="px-1.5 py-1 text-xs text-grey-mid">—</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {list.map((champ) => {
            const winRate = Math.round((champ.wins / champ.games) * 100);
            return (
              <li key={champ.championId}>
                <BarRow fraction={champ.games / max}>
                  <div className="flex items-center gap-1.5 text-xs">
                    <ChampionIcon
                      championId={champ.championId}
                      championName={champ.championName}
                      version={version}
                      championMap={championMap}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-grey-light">
                      {championDisplayName(champ.championId, championMap, champ.championName)}
                    </span>
                    <span className="shrink-0 tabular-nums text-grey-mid">{champ.games}</span>
                    <span
                      className={cn("w-8 shrink-0 text-right tabular-nums", winRateTone(winRate))}
                    >
                      {winRate}%
                    </span>
                  </div>
                </BarRow>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TeamScoutingView({
  games,
  filter,
  version,
  championMap,
  champions,
  playerNames,
  basePath = "",
}: {
  /** Every recorded game. The filter is applied here, not by the page. */
  games: TeamGameView[];
  filter: TeamMatchFilter;
  version: string;
  championMap: Map<number, ChampionInfo>;
  champions: Champion[];
  playerNames: PlayerLookup;
  basePath?: string;
}) {
  const filtered = applyTeamMatchFilter(games, filter);
  const options = teamMatchFilterOptions(games);

  const record = overallRecord(filtered);
  const draftOrder = firstPickSplit(filtered);
  const duration = teamDurationSplit(filtered);
  const ourPools = aggregatePicksByRole(filtered, "ally");
  const theirPools = aggregatePicksByRole(filtered, "enemy");
  const ourBans = countBans(filtered, "ally").slice(0, TOP_N);
  const theirBans = countBans(filtered, "enemy").slice(0, TOP_N);
  const series = groupBySeries(filtered);

  return (
    <div className="flex flex-col gap-6">
      <TeamFilterBar
        filter={filter}
        options={options}
        champions={champions}
        version={version}
        basePath={basePath}
        resultCount={filtered.length}
        totalCount={games.length}
      />

      {filtered.length === 0 ? (
        // Names the filter rather than the data. "No games" on a page whose
        // whole job is narrowing reads as an empty database; the honest message
        // is that this particular combination never happened.
        <p className="panel-hex px-4 py-12 text-center text-sm text-grey-mid">
          No recorded game matches every one of these filters. Loosen one — the counts beside
          each option are over all {games.length} games.
        </p>
      ) : (
        <>
          <section className="grid gap-3 lg:grid-cols-3">
            <div className="panel-hex panel-hex-clip flex items-center gap-4 p-5">
              <WinrateRing percentage={record.winRate} size={64} strokeWidth={6} />
              <div className="min-w-0">
                <p className="font-heading text-2xl leading-none font-semibold tabular-nums text-white">
                  {record.wins}
                  <span className="text-grey-mid">–</span>
                  {record.losses}
                </p>
                <p className="mt-1 text-xs text-grey-light">
                  {record.games} game{record.games === 1 ? "" : "s"} across {series.length} series
                </p>
                {isEmptyTeamMatchFilter(filter) && (
                  <div className="mt-2">
                    <MetaChip>Every recorded game</MetaChip>
                  </div>
                )}
              </div>
            </div>

            <SectionCard
              title="Draft order"
              caption="Blue side picks first, so this is the first-pick record. Unlike soloq, the side is something a bracket hands you and a coach plans around."
              className="lg:col-span-2"
            >
              <RecordLine label="First pick (blue)" record={draftOrder.first} />
              <RecordLine label="Second pick (red)" record={draftOrder.second} />
            </SectionCard>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <SectionCard
              title="Game length"
              caption={durationCaption(duration.counted, duration.untimed, duration.tooShort)}
            >
              <DurationSplit buckets={duration.buckets} />
            </SectionCard>

            <SectionCard
              title="Past each minute"
              caption={
                duration.swing
                  ? `${duration.swing.delta >= 0 ? "+" : ""}${duration.swing.delta} points between minute ${duration.swing.fromMinute} and minute ${duration.swing.toMinute}.`
                  : "Not enough games at any two marks to read a trend."
              }
            >
              <DurationCurve points={duration.curve} height={180} />
            </SectionCard>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <SectionCard title="Our pools" caption={`Top ${TOP_N} per role, by games played.`}>
              <div className="grid gap-3 sm:grid-cols-2">
                {TEAM_ROLES.map((role) => (
                  <PickPool
                    key={role}
                    role={role}
                    champions={ourPools.get(role)}
                    version={version}
                    championMap={championMap}
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Their pools"
              caption="Every opponent in this selection, pooled. Narrow to one opponent above to scout a specific team."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {TEAM_ROLES.map((role) => (
                  <PickPool
                    key={role}
                    role={role}
                    champions={theirPools.get(role)}
                    version={version}
                    championMap={championMap}
                  />
                ))}
              </div>
            </SectionCard>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <SectionCard title="We banned" caption="First-ban count in brackets — the closest thing to a priority signal.">
              <BanRow bans={ourBans} version={version} championMap={championMap} games={filtered.length} />
            </SectionCard>
            <SectionCard
              title="They banned"
              caption="What the field takes away from us — the picks we will not get in a real game."
            >
              <BanRow bans={theirBans} version={version} championMap={championMap} games={filtered.length} />
            </SectionCard>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-lg font-semibold text-white">
              Matching games{" "}
              <span className="text-sm font-normal text-grey-mid">({filtered.length})</span>
            </h2>
            <div className="flex flex-col gap-3">
              {filtered.map((game) => (
                <TeamGameCard
                  key={game.id}
                  game={game}
                  version={version}
                  championMap={championMap}
                  playerNames={playerNames}
                  basePath={basePath}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * States what the split is actually over.
 *
 * `duration_seconds` is nullable and typed by hand, and scrims have no
 * 15-minute floor, so both kinds of excluded game are real here. A length split
 * that silently describes 26 of 40 games is the failure this sentence exists to
 * prevent.
 */
function durationCaption(counted: number, untimed: number, tooShort: number): string {
  const excluded: string[] = [];
  if (untimed > 0) excluded.push(`${untimed} with no duration recorded`);
  if (tooShort > 0) excluded.push(`${tooShort} under 15 minutes`);

  const base = `Over ${counted} game${counted === 1 ? "" : "s"}`;
  return excluded.length === 0 ? `${base}.` : `${base} — excludes ${excluded.join(" and ")}.`;
}

function BanRow({
  bans,
  version,
  championMap,
  games,
}: {
  bans: Array<{ championId: number; count: number; firstCount: number }>;
  version: string;
  championMap: Map<number, ChampionInfo>;
  games: number;
}) {
  if (bans.length === 0) return <p className="text-sm text-grey-mid">No bans recorded.</p>;
  const max = bans[0].count;

  return (
    <ul className="flex flex-col gap-0.5">
      {bans.map((ban) => (
        <li key={ban.championId}>
          <BarRow fraction={ban.count / max} tone="loss">
            <div className="flex items-center gap-2 text-sm">
              <ChampionIcon
                championId={ban.championId}
                version={version}
                championMap={championMap}
                size="sm"
                banned
              />
              <span className="min-w-0 flex-1 truncate text-grey-light">
                {championDisplayName(ban.championId, championMap, String(ban.championId))}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-grey-mid">
                {ban.count}
                {ban.firstCount > 0 && <span className="ml-1 opacity-70">({ban.firstCount})</span>}
              </span>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-grey-mid">
                {games === 0 ? 0 : Math.round((ban.count / games) * 100)}%
              </span>
            </div>
          </BarRow>
        </li>
      ))}
    </ul>
  );
}
