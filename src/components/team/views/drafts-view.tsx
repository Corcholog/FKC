import { championDisplayName, type ChampionInfo } from "@/lib/ddragon";
import { formatRole } from "@/lib/roles";
import {
  aggregatePicks,
  aggregatePicksByRole,
  countBans,
  championPresence,
  type ChampionBanCount,
  type ChampionPickAgg,
} from "@/lib/team/draft-stats";
import { TEAM_ROLES, type TeamGameView } from "@/lib/team/types";
import { ChampionIcon } from "@/components/champion-icon";
import { BarRow, winRateTone } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// Draft aggregates across every recorded game — /prep/picks.
//
// The only view in this section that names nobody: it renders champions, bans
// and rates and not a single person, which is why it is the one worth checking
// first when the team_* reads are in doubt — a wrong number here is a wrong
// query, with no name resolution in the way to blame it on.

const TOP_N = 12;

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel-hex flex flex-col gap-3 p-4">
      <div>
        <h2 className="font-heading text-base font-semibold text-white">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-grey-mid">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-grey-mid">{children}</p>;
}

function PickList({
  champions,
  version,
  championMap,
  emptyLabel,
}: {
  champions: ChampionPickAgg[];
  version: string;
  championMap: Map<number, ChampionInfo>;
  emptyLabel: string;
}) {
  if (champions.length === 0) return <Empty>{emptyLabel}</Empty>;
  // Bars are scaled against the most-picked champion in this list, not against
  // total games: the question these lists answer is "what do we lean on", which
  // is a comparison within the list.
  const max = champions[0]?.games ?? 1;

  return (
    <ul className="flex flex-col gap-0.5">
      {champions.map((champ) => {
        const winRate = Math.round((champ.wins / champ.games) * 100);
        return (
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
                  {championDisplayName(champ.championId, championMap, champ.championName)}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-grey-mid">
                  {champ.wins}–{champ.games - champ.wins}
                </span>
                <span className={cn("w-9 shrink-0 text-right text-xs tabular-nums", winRateTone(winRate))}>
                  {winRate}%
                </span>
              </div>
            </BarRow>
          </li>
        );
      })}
    </ul>
  );
}

function BanList({
  bans,
  version,
  championMap,
  emptyLabel,
}: {
  bans: ChampionBanCount[];
  version: string;
  championMap: Map<number, ChampionInfo>;
  emptyLabel: string;
}) {
  if (bans.length === 0) return <Empty>{emptyLabel}</Empty>;
  const max = bans[0]?.count ?? 1;

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
              {ban.firstCount > 0 && (
                <span
                  className="shrink-0 rounded-sm bg-gold/15 px-1 text-[10px] font-medium tracking-wide text-gold uppercase"
                  title={`First ban ${ban.firstCount} time(s) — the closest thing to a priority signal`}
                >
                  {ban.firstCount} first
                </span>
              )}
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

export function TeamDraftsView({
  games,
  version,
  championMap,
}: {
  games: TeamGameView[];
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  const ourPicks = aggregatePicks(games, "ally").slice(0, TOP_N);
  const theirPicks = aggregatePicks(games, "enemy").slice(0, TOP_N);
  const ourBans = countBans(games, "ally").slice(0, TOP_N);
  const bansAgainstUs = countBans(games, "enemy").slice(0, TOP_N);
  const presence = championPresence(games).slice(0, TOP_N);
  const ourPools = aggregatePicksByRole(games, "ally");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-grey-mid">
        Across {games.length} game{games.length === 1 ? "" : "s"}. Pick order isn&apos;t recorded, so
        nothing here claims who first-picked or who countered whom — side is the only ordering
        signal, and blue side picks first.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What we pick" hint="Our champions, and how they've gone.">
          <PickList
            champions={ourPicks}
            version={version}
            championMap={championMap}
            emptyLabel="Nothing picked yet."
          />
        </Panel>

        <Panel title="What they pick" hint="Every opponent's champions, with their record on them.">
          <PickList
            champions={theirPicks}
            version={version}
            championMap={championMap}
            emptyLabel="Nothing picked yet."
          />
        </Panel>

        <Panel
          title="Banned against us"
          hint="The respect list — what the field refuses to let us have."
        >
          <BanList
            bans={bansAgainstUs}
            version={version}
            championMap={championMap}
            emptyLabel="No bans recorded."
          />
        </Panel>

        <Panel title="What we ban" hint="What we take off the board.">
          <BanList
            bans={ourBans}
            version={version}
            championMap={championMap}
            emptyLabel="No bans recorded."
          />
        </Panel>
      </div>

      <Panel title="Presence" hint="Picked or banned by either side, as a share of games played.">
        <ul className="flex flex-col gap-0.5">
          {presence.map((champ) => (
            <li key={champ.championId}>
              {/* Scaled against 100% rather than the top row: presence is a rate
                  with a real ceiling, so the bar should show distance from it.
                  It can exceed 100% when both teams ban the same champion every
                  game, which is why the fill is clamped. */}
              <BarRow fraction={champ.presence / 100}>
                <div className="flex items-center gap-2 text-sm">
                  <ChampionIcon
                    championId={champ.championId}
                    version={version}
                    championMap={championMap}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-grey-light">
                    {championDisplayName(champ.championId, championMap, String(champ.championId))}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-grey-mid">
                    {champ.picked} picked
                    <span className="mx-1 opacity-50">·</span>
                    {champ.banned} banned
                  </span>
                  <span className="font-heading w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-gold">
                    {champ.presence}%
                  </span>
                </div>
              </BarRow>
            </li>
          ))}
        </ul>
      </Panel>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-white">Our pools by role</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TEAM_ROLES.map((role) => (
            <Panel key={role} title={formatRole(role)}>
              <PickList
                champions={(ourPools.get(role) ?? []).slice(0, 8)}
                version={version}
                championMap={championMap}
                emptyLabel="Nothing played here yet."
              />
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}
