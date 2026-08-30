import { formatDuration } from "@/lib/format";
import type { ChampionInfo } from "@/lib/ddragon";
import { pickChampions } from "@/lib/team/history";
import type { TeamGameView } from "@/lib/team/types";
import type { TeamNoteThread } from "@/lib/team/notes";
import { CompareBoard, type PlayerLookup } from "@/components/team/compare-board";
import { TeamGameNotes } from "@/components/team/game-notes";
import { MetaChip, ResultBadge, SideBadge } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// Read-only view of one team match's draft. Server component — no
// interactivity, and keeping it off the client means the champion map isn't
// serialised into the RSC payload for every game on the page.
//
// The board itself lives in compare-board.tsx, because the team match history
// renders the same two-composition layout for a flex game, which has picks but
// no opponent row and no `TeamGameView` to hang them off. This file is what
// turns a team match into that shape.

// Re-exported: every caller of DraftBoard imports the lookup type from here, and
// the type belongs with the board rather than with the adapter.
export type { PlayerLookup };

export function DraftBoard({
  game,
  version,
  championMap,
  playerNames,
  ourName = "Us",
  basePath = "",
}: {
  game: TeamGameView;
  version: string;
  championMap: Map<number, ChampionInfo>;
  /** Roster ids to the names and slugs used everywhere else on the site. */
  playerNames: PlayerLookup;
  ourName?: string;
  /** "/demo" on the public copy — prefixes the link from a pick to its player. */
  basePath?: string;
}) {
  return (
    <CompareBoard
      allies={pickChampions(game.picks, true)}
      enemies={pickChampions(game.picks, false)}
      allyBans={game.ally_bans}
      enemyBans={game.enemy_bans}
      ourName={ourName}
      theirName={game.opponent.name}
      durationSeconds={game.duration_seconds}
      version={version}
      championMap={championMap}
      playerNames={playerNames}
      basePath={basePath}
    />
  );
}

/**
 * The bar above a draft: which game, how it went, which side we were on.
 *
 * The win/loss accent is a left border rather than a tinted card, matching
 * MatchRowShell — a full colour wash on a card this dense would fight the
 * champion portraits for attention.
 */
export function GameHeader({ game }: { game: TeamGameView }) {
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
export function TeamGameCard({
  game,
  version,
  championMap,
  playerNames,
  notes,
  currentUserId,
  ourName,
  basePath = "",
}: {
  game: TeamGameView;
  version: string;
  championMap: Map<number, ChampionInfo>;
  playerNames: PlayerLookup;
  /**
   * Newest first, replies attached. Omitted on surfaces that don't load notes —
   * which includes the whole public demo: there is no demo view of
   * team_game_notes, deliberately.
   */
  notes?: TeamNoteThread[];
  /** Whose notes carry Edit/Delete. Null for the shared viewer account. */
  currentUserId?: string | null;
  ourName?: string;
  basePath?: string;
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
          basePath={basePath}
        />
        {/* Undefined means "this page doesn't do notes"; an empty array means
            "no notes yet", which still gets the composer. */}
        {notes !== undefined && (
          <TeamGameNotes
            gameId={game.id}
            threads={notes}
            currentUserId={currentUserId ?? null}
          />
        )}
      </div>
    </div>
  );
}
