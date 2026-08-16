import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { championDisplayName, type ChampionInfo } from "@/lib/ddragon";
import { formatKdaRatio, kdaRatioForGame } from "@/lib/format";
import { formatRole, formatRoleShort } from "@/lib/roles";
import { groupBySeries } from "@/lib/scrims/queries";
import {
  aggregatePicks,
  aggregatePicksByRole,
  countBans,
  type ChampionBanCount,
} from "@/lib/scrims/draft-stats";
import { deriveOpponentRoster, namedPickCoverage } from "@/lib/scrims/opponents";
import { overallRecord, recordBySide } from "@/lib/scrims/team-stats";
import { SCRIM_KIND_LABELS, SCRIM_ROLES, type ScrimGameView, type ScrimOpponentRow } from "@/lib/scrims/types";
import { ChampionIcon } from "@/components/champion-icon";
import { BarRow, MetaChip, SeriesScore, winRateTone } from "@/components/scrims/scrim-ui";
import { WinrateRing } from "@/components/winrate-ring";
import { cn } from "@/lib/utils";

// One opponent's scouting sheet — /scrims/opponents/[slug] and its demo.
//
// "Their roster" is derived from the nicknames typed into enemy pick rows, so on
// the demo it comes through demo_scrim_picks already replaced by a positional
// label. That has a real cost worth knowing about: the label is derived from
// (game, role), so two different toplaners on the same opponent collapse into
// one "Rival TOP" and their pools merge. The shape of the section is honest; the
// individual attribution inside it is not, on the demo only.
//
// `notesForm` is a slot because the private page's notes box writes to
// scrim_opponents. The demo passes nothing and the section simply isn't there.

function BanList({
  bans,
  version,
  championMap,
  tone,
}: {
  bans: ChampionBanCount[];
  version: string;
  championMap: Map<number, ChampionInfo>;
  tone: "gold" | "loss";
}) {
  if (bans.length === 0) return <p className="py-2 text-sm text-grey-mid">No bans recorded.</p>;
  const max = bans[0]?.count ?? 1;

  return (
    <ul className="flex flex-col gap-0.5">
      {bans.map((ban) => (
        <li key={ban.championId}>
          <BarRow fraction={ban.count / max} tone={tone}>
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
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-grey-light">
                {ban.count}×
              </span>
            </div>
          </BarRow>
        </li>
      ))}
    </ul>
  );
}

/**
 * The plan, cross-referenced against what they actually play.
 *
 * A target ban is a decision, and the number that justifies it is already on
 * this page — how often this opponent picked that champion. Putting the two
 * side by side is what turns the plan from a list into an argument, and it
 * catches a plan that has gone stale: a target they have not picked in the
 * games on record is either old prep or a read from somewhere else, and either
 * way that is worth seeing before Saturday.
 *
 * Read-only. The editor renders the same annotation from the same counts, which
 * is why they are passed in rather than derived twice.
 */
function BanPlan({
  championIds,
  pickCounts,
  version,
  championMap,
}: {
  championIds: number[];
  pickCounts: BanPlanPickCounts;
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  const counts = new Map(pickCounts);

  return (
    <ol className="flex flex-wrap gap-2">
      {championIds.map((id, index) => (
        <li
          key={id}
          className="flex items-center gap-2 rounded-sm border border-border bg-bg-tertiary/40 px-2 py-1.5"
        >
          <span className="text-xs tabular-nums text-grey-mid">{index + 1}</span>
          <ChampionIcon
            championId={id}
            version={version}
            championMap={championMap}
            size="sm"
            banned
          />
          <div className="min-w-0">
            <p className="truncate text-sm text-grey-light">
              {championDisplayName(id, championMap, String(id))}
            </p>
            <p className="text-[10px] text-grey-mid">{describePickCount(counts.get(id) ?? 0)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** `[championId, times this opponent picked it]`. An array, so it crosses to a client component. */
export type BanPlanPickCounts = Array<[number, number]>;

export function describePickCount(picked: number): string {
  return picked === 0 ? "not picked in these games" : `they picked it ${picked}×`;
}

export function OpponentScoutingView({
  opponent,
  games,
  version,
  championMap,
  basePath = "",
  notesForm,
  banPlanForm,
}: {
  opponent: ScrimOpponentRow;
  games: ScrimGameView[];
  version: string;
  championMap: Map<number, ChampionInfo>;
  basePath?: string;
  notesForm?: ReactNode;
  /**
   * The editor, as a render prop over the counts this view already derived —
   * so the editable list carries the same "they picked it 3×" annotation the
   * read-only one does without counting twice. Omitted on the demo, which falls
   * back to the read-only list.
   */
  banPlanForm?: (pickCounts: BanPlanPickCounts) => ReactNode;
}) {
  const overall = overallRecord(games);
  const sides = recordBySide(games);
  const roster = deriveOpponentRoster(games);
  const coverage = namedPickCoverage(games);
  // Their bans are aimed at us; ours are what we take from them.
  const theirBans = countBans(games, "enemy").slice(0, 10);
  const ourBans = countBans(games, "ally").slice(0, 10);
  const theirPools = aggregatePicksByRole(games, "enemy");
  const series = groupBySeries(games);
  // One pass over their picks, shared by the read-only plan and the editor.
  const banPlanCounts: BanPlanPickCounts = aggregatePicks(games, "enemy").map((c) => [
    c.championId,
    c.games,
  ]);

  return (
    <div className="flex flex-col gap-8">
      <Link
        href={`${basePath}/scrims/opponents`}
        className="flex w-fit items-center gap-1.5 text-sm text-grey-mid transition-colors hover:text-gold-bright"
      >
        <ArrowLeft className="h-4 w-4" />
        All opponents
      </Link>

      <div className="panel-hex panel-hex-clip flex flex-wrap items-center gap-4 p-5">
        {overall.games > 0 && <WinrateRing percentage={overall.winRate} size={64} strokeWidth={5} />}
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold text-white">{opponent.name}</h2>
          <p className="mt-0.5 text-sm text-grey-light">
            {overall.games === 0 ? (
              "Never played."
            ) : (
              <>
                {overall.games} game{overall.games === 1 ? "" : "s"} over {series.length} series
                <span className="mx-1.5 opacity-50">·</span>
                blue {sides.blue.wins}–{sides.blue.losses}
                <span className="mx-1.5 opacity-50">·</span>
                red {sides.red.wins}–{sides.red.losses}
              </>
            )}
          </p>
        </div>
        {overall.games > 0 && (
          <SeriesScore wins={overall.wins} losses={overall.losses} className="ml-auto text-2xl" />
        )}
      </div>

      {/* The plan sits above the history, because it is the thing you act on
          and the history below is what justifies it. Without an editor it
          renders read-only, and disappears entirely when there is no plan —
          the demo should show prep that exists, not an empty affordance for
          something it cannot do. */}
      {(banPlanForm || opponent.target_bans.length > 0) && (
        <section className="panel-hex flex flex-col gap-3 p-4">
          {banPlanForm ? (
            banPlanForm(banPlanCounts)
          ) : (
            <>
              <div>
                <h3 className="font-heading text-base font-semibold text-white">Ban plan</h3>
                <p className="mt-0.5 text-xs text-grey-mid">
                  Who we take off them, in the order we take it.
                </p>
              </div>
              <BanPlan
                championIds={opponent.target_bans}
                pickCounts={banPlanCounts}
                version={version}
                championMap={championMap}
              />
            </>
          )}
        </section>
      )}

      {notesForm}

      {games.length === 0 ? (
        <p className="text-sm text-grey-mid">
          No games against {opponent.name} yet. Add a series and this fills in.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-heading text-lg font-semibold text-white">Their roster</h3>
              <span className="text-xs text-grey-mid">
                Derived from nicknames on their picks — {coverage.named} of {coverage.total} named
              </span>
            </div>

            {roster.length === 0 ? (
              <p className="panel-hex p-4 text-sm text-grey-mid">
                Nobody named yet. Type their nicknames into the enemy rows when entering a draft and
                their pools show up here.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {roster.map((player) => {
                  const winRate =
                    player.games === 0 ? 0 : Math.round((player.wins / player.games) * 100);
                  return (
                    <div
                      key={`${player.teamPosition}:${player.name}`}
                      className="panel-hex flex flex-col gap-2.5 p-4"
                    >
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="rounded-sm bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-grey-light">
                          {formatRoleShort(player.teamPosition)}
                        </span>
                        <span className="font-medium text-white">{player.name}</span>
                        <span className="ml-auto text-xs tabular-nums text-grey-mid">
                          <span className={winRateTone(winRate)}>
                            {player.wins}–{player.games - player.wins}
                          </span>
                          <span className="mx-1 opacity-50">·</span>
                          {formatKdaRatio(
                            kdaRatioForGame(player.kills, player.deaths, player.assists),
                          )}{" "}
                          KDA
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {player.champions.map((champ) => (
                          <span
                            key={champ.championId}
                            title={`${championDisplayName(champ.championId, championMap, champ.championName)} — ${champ.games} game(s), ${champ.wins} won`}
                            className="flex items-center gap-1 rounded-sm bg-bg-tertiary py-0.5 pr-1.5 pl-0.5"
                          >
                            <ChampionIcon
                              championId={champ.championId}
                              championName={champ.championName}
                              version={version}
                              championMap={championMap}
                              size="sm"
                            />
                            <span className="text-xs tabular-nums text-grey-light">
                              {champ.games}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="panel-hex flex flex-col gap-3 p-4">
              <div>
                <h3 className="font-heading text-base font-semibold text-white">
                  What they ban against us
                </h3>
                <p className="mt-0.5 text-xs text-grey-mid">Plan the draft around these.</p>
              </div>
              <BanList bans={theirBans} version={version} championMap={championMap} tone="loss" />
            </div>

            <div className="panel-hex flex flex-col gap-3 p-4">
              <div>
                <h3 className="font-heading text-base font-semibold text-white">What we ban</h3>
                <p className="mt-0.5 text-xs text-grey-mid">
                  What we&apos;ve taken off them so far.
                </p>
              </div>
              <BanList bans={ourBans} version={version} championMap={championMap} tone="gold" />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="font-heading text-lg font-semibold text-white">Their pools by role</h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {SCRIM_ROLES.map((role) => {
                const pool = theirPools.get(role) ?? [];
                const max = pool[0]?.games ?? 1;
                return (
                  <div key={role} className="panel-hex flex flex-col gap-2 p-4">
                    <h4 className="text-xs font-semibold tracking-wide text-grey-light uppercase">
                      {formatRole(role)}
                    </h4>
                    {pool.length === 0 ? (
                      <p className="text-sm text-grey-mid">—</p>
                    ) : (
                      <ul className="flex flex-col gap-0.5">
                        {pool.map((champ) => (
                          <li key={champ.championId}>
                            <BarRow fraction={champ.games / max}>
                              <div className="flex items-center gap-2 text-sm">
                                <ChampionIcon
                                  championId={champ.championId}
                                  championName={champ.championName}
                                  version={version}
                                  championMap={championMap}
                                  size="sm"
                                />
                                <span className="min-w-0 flex-1 truncate text-grey-light">
                                  {championDisplayName(
                                    champ.championId,
                                    championMap,
                                    champ.championName,
                                  )}
                                </span>
                                <span className="shrink-0 text-xs tabular-nums text-grey-mid">
                                  {champ.wins}–{champ.games - champ.wins}
                                </span>
                              </div>
                            </BarRow>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-heading text-lg font-semibold text-white">Series played</h3>
            {series.map((entry) => {
              const wins = entry.games.filter((g) => g.win).length;
              return (
                <Link
                  key={entry.series.id}
                  href={`${basePath}/scrims/${entry.series.id}`}
                  className="panel-hex is-interactive flex flex-wrap items-center gap-3 px-4 py-2.5"
                >
                  <span className="text-sm text-grey-light">{entry.series.played_on}</span>
                  <MetaChip>{SCRIM_KIND_LABELS[entry.series.kind]}</MetaChip>
                  {entry.series.fearless && <MetaChip>Fearless</MetaChip>}
                  <span className={cn("ml-auto")}>
                    <SeriesScore wins={wins} losses={entry.games.length - wins} />
                  </span>
                </Link>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
