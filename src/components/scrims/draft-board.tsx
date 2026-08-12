import Link from "next/link";
import { championDisplayName, type ChampionInfo } from "@/lib/ddragon";
import { formatDuration, formatKDA } from "@/lib/format";
import { formatRoleShort } from "@/lib/roles";
import {
  BANS_PER_SIDE,
  SCRIM_ROLES,
  type ScrimGameView,
  type ScrimPickRow,
  type ScrimRole,
} from "@/lib/scrims/types";
import type { ScrimNoteThread } from "@/lib/scrims/notes";
import { ChampionIcon } from "@/components/champion-icon";
import { ScrimGameNotes } from "@/components/scrims/scrim-game-notes";
import { MetaChip, ResultBadge, SideBadge } from "@/components/scrims/scrim-ui";
import { cn } from "@/lib/utils";

// Read-only view of one game's draft. Server component — no interactivity, and
// keeping it off the client means the champion map isn't serialised into the
// RSC payload for every game on the page.
//
// Laid out as five *role-paired* rows rather than two independent team lists.
// Two lists put a champion next to a role label and pushed its own K/D/A to the
// far side of a greedy spacer, which is backwards: the champion and its stats
// are one fact. Pairing also makes the lane matchup — the thing you actually
// review a scrim for — readable straight down the middle, and halves the number
// of role labels on screen.

export type PlayerLookup = Map<string, { display_name: string; slug: string }>;

function PickSide({
  pick,
  mirrored,
  version,
  championMap,
  playerNames,
  durationSeconds,
}: {
  pick: ScrimPickRow | undefined;
  /** Enemy side: icon on the right, text right-aligned, so the two teams face off. */
  mirrored?: boolean;
  version: string;
  championMap: Map<number, ChampionInfo>;
  playerNames: PlayerLookup;
  durationSeconds: number | null;
}) {
  if (!pick) {
    // Unreachable through the form (ten picks are required and the database
    // enforces one per role per side) but a half-written row shouldn't take the
    // page down with it.
    return <div className="h-10 rounded-sm bg-bg-tertiary/40" />;
  }

  const roster = pick.player_id ? playerNames.get(pick.player_id) : undefined;
  const who = roster?.display_name ?? pick.player_name ?? null;
  const champion = championDisplayName(
    pick.champion_id,
    championMap,
    pick.champion_name,
  );
  const csPerMin =
    durationSeconds && durationSeconds > 0
      ? pick.total_cs / (durationSeconds / 60)
      : null;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        mirrored && "flex-row-reverse",
      )}
    >
      <ChampionIcon
        championId={pick.champion_id}
        championName={pick.champion_name}
        version={version}
        championMap={championMap}
        size="md"
        className="sm:h-10 sm:w-10"
      />
      <div className={cn("min-w-0 flex-1", mirrored && "text-right")}>
        <p className="truncate text-sm leading-tight font-medium text-white">
          {champion}
        </p>
        {/* Player and stats on one line directly under the champion: they
            describe the same pick, so they belong in the same block.
            Truncating rather than wrapping keeps all five rows the same
            height — see the sm: guards below for what gets dropped first when
            there isn't room, since truncation would otherwise eat the CS
            number, which is the least droppable thing on the line. */}
        <p className="truncate text-xs leading-tight text-grey-mid tabular-nums">
          {who && (
            <>
              {roster ? (
                <Link
                  href={`/player/${roster.slug}`}
                  className="text-grey-light transition-colors hover:text-gold-bright"
                >
                  {who}
                </Link>
              ) : (
                <span className="text-grey-light">{who}</span>
              )}
              <span className="mx-1 opacity-50">·</span>
            </>
          )}
          <span className="text-grey-light">
            {formatKDA(pick.kills, pick.deaths, pick.assists)}
          </span>
          <span className="mx-1 opacity-50">·</span>
          {pick.total_cs} cs
          {/* CS/min is the first thing to go on a narrow screen: it's derived
              from the raw CS already shown, so dropping it loses nothing you
              can't recompute, and it buys ~7 characters back for the name. */}
          {csPerMin !== null && (
            <span className="hidden sm:inline"> ({csPerMin.toFixed(1)})</span>
          )}
        </p>
      </div>
    </div>
  );
}

function BanRow({
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
  // so a series where somebody only recorded three is visibly incomplete rather
  // than silently looking like a three-ban format.
  const slots = Array.from(
    { length: Math.max(BANS_PER_SIDE, bans.length) },
    (_, i) => bans[i],
  );

  return (
    <div
      className={cn("flex items-center gap-1", mirrored && "flex-row-reverse")}
    >
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

export function DraftBoard({
  game,
  version,
  championMap,
  playerNames,
  ourName = "Us",
}: {
  game: ScrimGameView;
  version: string;
  championMap: Map<number, ChampionInfo>;
  /** Roster ids to the names and slugs used everywhere else on the site. */
  playerNames: PlayerLookup;
  ourName?: string;
}) {
  const byRole = (ally: boolean) =>
    new Map(
      game.picks
        .filter((p) => p.ally === ally)
        .map((p) => [p.team_position, p]),
    );
  const allies = byRole(true);
  const enemies = byRole(false);

  // Row template is shared by the ban strip and every pick row so the centre
  // column stays a true axis all the way down the card.
  //
  // ScrimGameCard caps the measure this sits in. Without that cap, 1fr per side
  // on a max-w-6xl page pins the two teams to opposite edges with a canyon
  // between them — the opposite of a face-off, and the reason the champion felt
  // stranded from its own stats.
  const row =
    "grid grid-cols-[1fr_2.25rem_1fr] items-center gap-2 sm:grid-cols-[1fr_3rem_1fr] sm:gap-3";

  return (
    <div className="flex w-full flex-col gap-2">
      <div className={cn(row, "text-xs")}>
        <span className="truncate font-medium text-gold">{ourName}</span>
        <span className="text-center text-[10px] font-semibold tracking-wider text-grey-mid uppercase">
          vs
        </span>
        <span className="truncate text-right font-medium text-grey-light">
          {game.opponent.name}
        </span>
      </div>

      <div className={cn(row)}>
        <BanRow
          bans={game.ally_bans}
          version={version}
          championMap={championMap}
        />
        <span className="text-center text-[10px] font-semibold tracking-wider text-grey-mid uppercase">
          Bans
        </span>
        <BanRow
          bans={game.enemy_bans}
          mirrored
          version={version}
          championMap={championMap}
        />
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border pt-2">
        {SCRIM_ROLES.map((role: ScrimRole) => (
          <div
            key={role}
            className={cn(
              row,
              "rounded-sm py-0.5 transition-colors hover:bg-bg-tertiary/40",
            )}
          >
            <PickSide
              pick={allies.get(role)}
              version={version}
              championMap={championMap}
              playerNames={playerNames}
              durationSeconds={game.duration_seconds}
            />
            <span className="text-center text-[10px] font-semibold tracking-wider text-grey-mid">
              {formatRoleShort(role)}
            </span>
            <PickSide
              pick={enemies.get(role)}
              mirrored
              version={version}
              championMap={championMap}
              playerNames={playerNames}
              durationSeconds={game.duration_seconds}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The bar above a draft: which game, how it went, which side we were on.
 *
 * The win/loss accent is a left border rather than a tinted card, matching
 * MatchRowShell — a full colour wash on a card this dense would fight the
 * champion portraits for attention.
 */
export function GameHeader({ game }: { game: ScrimGameView }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-l-4 pl-3",
        game.win ? "border-l-win" : "border-l-loss",
      )}
    >
      <span className="font-heading text-sm font-semibold text-white">
        Game {game.game_number}
      </span>
      <ResultBadge win={game.win} />
      <SideBadge side={game.side} />
      <span className="ml-auto flex items-center gap-2">
        {game.patch && <MetaChip>Patch {game.patch}</MetaChip>}
        {game.duration_seconds !== null && game.duration_seconds > 0 && (
          <span className="text-xs tabular-nums text-grey-mid">
            {formatDuration(game.duration_seconds)}
          </span>
        )}
      </span>
    </div>
  );
}

/** One game as a self-contained card — header, draft, and its note thread. */
export function ScrimGameCard({
  game,
  version,
  championMap,
  playerNames,
  notes,
  currentUserId,
  ourName,
}: {
  game: ScrimGameView;
  version: string;
  championMap: Map<number, ChampionInfo>;
  playerNames: PlayerLookup;
  /** Newest first, replies attached. Omitted on surfaces that don't load notes. */
  notes?: ScrimNoteThread[];
  /** Whose notes carry Edit/Delete. Null for the shared viewer account. */
  currentUserId?: string | null;
  ourName?: string;
}) {
  return (
    <div className="panel-hex p-3 sm:p-4">
      {/* One measure for the header and the board, centred in the card, so the
          duration on the right sits above the enemy team rather than out past
          it. */}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <GameHeader game={game} />
        <DraftBoard
          game={game}
          version={version}
          championMap={championMap}
          playerNames={playerNames}
          ourName={ourName}
        />
        {/* Undefined means "this page doesn't do notes"; an empty array means
            "no notes yet", which still gets the composer. */}
        {notes !== undefined && (
          <ScrimGameNotes
            gameId={game.id}
            threads={notes}
            currentUserId={currentUserId ?? null}
          />
        )}
      </div>
    </div>
  );
}
