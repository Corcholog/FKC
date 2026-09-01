import Link from "next/link";
import { championDisplayName, type ChampionInfo } from "@/lib/ddragon";
import { formatKDA } from "@/lib/format";
import { formatRoleShort } from "@/lib/roles";
import { BANS_PER_SIDE, TEAM_ROLES, enemySide, nicknameOf, type TeamSide } from "@/lib/team/types";
import type { HistoryChampion } from "@/lib/team/history";
import { ChampionIcon } from "@/components/champion-icon";
import { SideBadge } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// Two compositions, laid out face to face — the board under a draft on the
// series pages, and the board inside an expanded row of the match history.
//
// Laid out as five *role-paired* rows rather than two independent team lists.
// Two lists put a champion next to a role label and pushed its own K/D/A to the
// far side of a greedy spacer, which is backwards: the champion and its stats
// are one fact. Pairing also makes the lane matchup — the thing you actually
// review a game for — readable straight down the middle, and halves the number
// of role labels on screen.
//
// Server component throughout: nothing here is interactive, and keeping it off
// the client means the champion map isn't serialised into the RSC payload once
// per game on a page that renders a hundred of them.
//
// Every breakpoint here is a **container** query, not a viewport one. This board
// renders both as the body of a card and inside an expanded history row, and
// that row's shell declares `@container` — so a viewport `sm:` would grow the
// board at a width the row around it knows nothing about, and the two would
// disagree about how much space there is.

/** Roster ids to the names and slugs used everywhere else on the site. */
export type PlayerLookup = Map<string, { display_name: string; slug: string }>;

function ChampionSide({
  champion,
  mirrored,
  version,
  championMap,
  playerNames,
  durationSeconds,
}: {
  champion: HistoryChampion | undefined;
  /** Enemy side: icon on the right, text right-aligned, so the two teams face off. */
  mirrored?: boolean;
  version: string;
  championMap: Map<number, ChampionInfo>;
  playerNames: PlayerLookup;
  durationSeconds: number | null;
}) {
  if (!champion) {
    // Reachable two ways: a half-written team match (the form requires ten picks
    // and the database enforces one per role per side, so only by hand), and a
    // Riot game where somebody's team_position came back empty. Neither should
    // take the page down.
    return <div className="h-10 rounded-sm bg-bg-tertiary/40" />;
  }

  const roster = champion.playerId ? playerNames.get(champion.playerId) : undefined;
  // An imported pick stores the whole Riot ID, but this line is tight enough
  // that CS/min gets dropped on a narrow screen to buy the name room — spending
  // that back on "#LAS" five times over would be a poor trade. The tag is on
  // hover instead, and in full on the scouting page where there's space.
  const storedName = champion.playerName?.trim() || null;
  const who = roster?.display_name ?? (storedName && nicknameOf(storedName));
  const name = championDisplayName(champion.championId, championMap, champion.championName);
  const csPerMin =
    durationSeconds && durationSeconds > 0 ? champion.totalCs / (durationSeconds / 60) : null;

  return (
    <div className={cn("flex min-w-0 items-center gap-2", mirrored && "flex-row-reverse")}>
      <ChampionIcon
        championId={champion.championId}
        championName={champion.championName}
        version={version}
        championMap={championMap}
        size="md"
        className="@md:h-10 @md:w-10"
      />
      <div className={cn("min-w-0 flex-1", mirrored && "text-right")}>
        <p className="truncate text-sm leading-tight font-medium text-white">{name}</p>
        {/* Player and stats on one line directly under the champion: they
            describe the same pick, so they belong in the same block.
            Truncating rather than wrapping keeps all five rows the same
            height — see the @md: guards below for what gets dropped first when
            there isn't room, since truncation would otherwise eat the CS
            number, which is the least droppable thing on the line. */}
        <p className="truncate text-xs leading-tight text-grey-mid tabular-nums">
          {who && (
            <>
              {roster ? (
                <Link
                  href={`/players/${roster.slug}`}
                  className="text-grey-light transition-colors hover:text-gold-bright"
                >
                  {who}
                </Link>
              ) : (
                <span className="text-grey-light" title={storedName ?? undefined}>
                  {who}
                </span>
              )}
              <span className="mx-1 opacity-50">·</span>
            </>
          )}
          <span className="text-grey-light">
            {formatKDA(champion.kills, champion.deaths, champion.assists)}
          </span>
          <span className="mx-1 opacity-50">·</span>
          {champion.totalCs} cs
          {/* CS/min is the first thing to go on a narrow screen: it's derived
              from the raw CS already shown, so dropping it loses nothing you
              can't recompute, and it buys ~7 characters back for the name. */}
          {csPerMin !== null && <span className="hidden @md:inline"> ({csPerMin.toFixed(1)})</span>}
        </p>
      </div>
    </div>
  );
}

function BanStrip({
  bans,
  mirrored,
  version,
  championMap,
}: {
  bans: number[];
  mirrored?: boolean;
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  // Empty slots are rendered, not skipped: five boxes always means "five bans",
  // so a game where somebody only recorded three is visibly incomplete rather
  // than silently looking like a three-ban format.
  const slots = Array.from({ length: Math.max(BANS_PER_SIDE, bans.length) }, (_, i) => bans[i]);

  return (
    <div className={cn("flex items-center gap-1", mirrored && "flex-row-reverse")}>
      {slots.map((championId, i) =>
        championId === undefined ? (
          <span
            key={`empty-${i}`}
            className="h-6 w-6 shrink-0 rounded-sm border border-dashed border-border/60"
          />
        ) : (
          <ChampionIcon
            key={`${championId}-${i}`}
            championId={championId}
            version={version}
            championMap={championMap}
            size="sm"
            banned
          />
        ),
      )}
    </div>
  );
}

type BoardRow = { label: string; ally?: HistoryChampion; enemy?: HistoryChampion };

/**
 * The two sides paired up, by role where a role is known.
 *
 * Team matches always know: `team_position` is a required column with a check
 * constraint, one row per role per side. Riot does not always — a remake, an
 * autofilled lobby or a very old game can come back with an empty
 * `team_position` — so anything left over after the five roles is paired
 * positionally under a blank label instead of being dropped. A champion missing
 * from a composition is exactly the kind of wrong this page can't afford, since
 * a four-man team still renders as a plausible four-man team.
 */
export function pairByRole(
  allies: HistoryChampion[],
  enemies: HistoryChampion[],
): BoardRow[] {
  const take = (pool: HistoryChampion[], role: string) => {
    const index = pool.findIndex((c) => c.teamPosition === role);
    return index === -1 ? undefined : pool.splice(index, 1)[0];
  };

  const allyPool = [...allies];
  const enemyPool = [...enemies];
  const rows: BoardRow[] = TEAM_ROLES.map((role) => ({
    label: formatRoleShort(role),
    ally: take(allyPool, role),
    enemy: take(enemyPool, role),
  }));

  for (let i = 0; i < Math.max(allyPool.length, enemyPool.length); i += 1) {
    rows.push({ label: "", ally: allyPool[i], enemy: enemyPool[i] });
  }

  return rows;
}

/**
 * Our composition, theirs, and the bans that shaped them.
 *
 * The two sides arrive as plain champion rows rather than as picks or
 * participants, which is what lets one board serve a hand-entered scrim and a
 * Riot flex game — the only difference between them at this level is which
 * columns happened to be null upstream.
 */
export function CompareBoard({
  allies,
  enemies,
  allyBans = [],
  enemyBans = [],
  showBans = true,
  ourName = "Us",
  theirName,
  side,
  durationSeconds,
  version,
  championMap,
  playerNames,
}: {
  allies: HistoryChampion[];
  enemies: HistoryChampion[];
  allyBans?: number[];
  enemyBans?: number[];
  /**
   * Off where bans genuinely weren't recorded. Rendering the strip anyway would
   * claim ten empty slots means nobody banned, which on a Riot game synced
   * before migration 024 is false rather than incomplete.
   */
  showBans?: boolean;
  ourName?: string;
  theirName: string;
  /**
   * Which side we were on. Optional only because a caller may genuinely not
   * know; when it is passed, both headings are badged, which is the only thing
   * on this board that says who picked first.
   */
  side?: TeamSide;
  durationSeconds: number | null;
  version: string;
  championMap: Map<number, ChampionInfo>;
  playerNames: PlayerLookup;
}) {
  // Row template is shared by the ban strip and every pick row so the centre
  // column stays a true axis all the way down the card.
  //
  // The caller caps the measure this sits in. Without that cap, 1fr per side on
  // a max-w-6xl page pins the two teams to opposite edges with a canyon between
  // them — the opposite of a face-off, and the reason the champion felt
  // stranded from its own stats.
  const row =
    "grid grid-cols-[1fr_2.25rem_1fr] items-center gap-2 @md:grid-cols-[1fr_3rem_1fr] @md:gap-3";

  return (
    <div className="flex w-full flex-col gap-2">
      <div className={cn(row, "text-xs")}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium text-gold">{ourName}</span>
          {side && <SideBadge side={side} />}
        </span>
        <span className="text-center text-[10px] font-semibold tracking-wider text-grey-mid uppercase">
          vs
        </span>
        <span className="flex min-w-0 items-center justify-end gap-1.5">
          {side && <SideBadge side={enemySide(side)} />}
          <span className="truncate font-medium text-grey-light">{theirName}</span>
        </span>
      </div>

      {showBans && (
        <div className={cn(row)}>
          <BanStrip bans={allyBans} version={version} championMap={championMap} />
          <span className="text-center text-[10px] font-semibold tracking-wider text-grey-mid uppercase">
            Bans
          </span>
          <BanStrip bans={enemyBans} mirrored version={version} championMap={championMap} />
        </div>
      )}

      <div className="flex flex-col gap-0.5 border-t border-border pt-2">
        {pairByRole(allies, enemies).map((entry, i) => (
          <div
            key={`${entry.label}-${i}`}
            className={cn(row, "rounded-sm py-0.5 transition-colors hover:bg-bg-tertiary/40")}
          >
            <ChampionSide
              champion={entry.ally}
              version={version}
              championMap={championMap}
              playerNames={playerNames}
              durationSeconds={durationSeconds}
            />
            <span className="text-center text-[10px] font-semibold tracking-wider text-grey-mid">
              {entry.label}
            </span>
            <ChampionSide
              champion={entry.enemy}
              mirrored
              version={version}
              championMap={championMap}
              playerNames={playerNames}
              durationSeconds={durationSeconds}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
