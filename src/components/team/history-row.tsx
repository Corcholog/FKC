import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatDuration, formatRelativeTime } from "@/lib/format";
import type { ChampionInfo } from "@/lib/ddragon";
import { leagueOfGraphsMatchUrl } from "@/lib/match-links";
import type { HistoryChampion, HistoryEntry } from "@/lib/team/history";
import type { TeamNoteThread } from "@/lib/team/notes";
import { ChampionIcon } from "@/components/champion-icon";
import { MatchRowShell } from "@/components/match-row-shell";
import { CompareBoard, type PlayerLookup } from "@/components/team/compare-board";
import { TeamGameNotes } from "@/components/team/game-notes";
import { MetaChip, SideBadge } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// One game of the team's history, collapsed to a line.
//
// The line answers the only three questions a history is scanned for — did we
// win, what did we play, what did they play — and everything else is behind the
// chevron. That split is what makes a flex game and a scrim renderable as the
// same row: the difference between them is entirely in the panel, where a scrim
// has a draft to open in place and a flex game has ten Riot accounts this app
// deliberately doesn't republish, and so links out instead.

function CompStrip({
  champions,
  mirrored,
  version,
  championMap,
}: {
  champions: HistoryChampion[];
  /** Enemy side, laid out right to left so the two teams face each other. */
  mirrored?: boolean;
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  return (
    <div className={cn("flex items-center gap-1 @md:gap-1.5", mirrored && "flex-row-reverse")}>
      {champions.map((champion, i) => (
        <ChampionIcon
          key={`${champion.championId}-${i}`}
          championId={champion.championId}
          championName={champion.championName}
          version={version}
          championMap={championMap}
          // The compositions are what this row exists to show, so they get the
          // space. Three steps rather than two: ten portraits plus a "vs" have
          // to fit a phone, and at the widest they should be readable without
          // opening the row at all.
          size="md"
          className="@md:h-10 @md:w-10 @2xl:h-12 @2xl:w-12"
        />
      ))}
    </div>
  );
}

/**
 * The result, in words rather than a coloured badge.
 *
 * The row already carries the win/loss accent on its left border, so a badge
 * beside it would say the same thing twice; the word is what survives being
 * read at a glance in a list of forty.
 */
function ResultLabel({ win }: { win: boolean }) {
  return (
    <span className={cn("text-sm font-semibold", win ? "text-win" : "text-loss")}>
      {win ? "Win" : "Loss"}
    </span>
  );
}

/**
 * The second line of the identity block: who it was against.
 *
 * Blank for flex, and that is not an omission. Every stored flex game is one the
 * team played as a five, so "full stack" would be true of all of them and worth
 * saying about none — and the enemy is a queue's worth of strangers with no name
 * to print.
 */
function EntrySubtitle({ entry }: { entry: HistoryEntry }) {
  if (entry.source !== "team") return null;
  return (
    <>
      <span className="text-grey-light">{entry.opponentName}</span>
      <span className="mx-1 opacity-50">·</span>
      Game {entry.gameNumber}
    </>
  );
}

export function TeamHistoryRow({
  entry,
  version,
  championMap,
  playerNames,
  basePath = "",
  notes,
  currentUserId,
}: {
  entry: HistoryEntry;
  version: string;
  championMap: Map<number, ChampionInfo>;
  playerNames: PlayerLookup;
  basePath?: string;
  /**
   * The game's review thread. Undefined means "this surface doesn't do notes",
   * which is every flex row and the whole public demo; an empty array means
   * "none yet", which still gets the composer.
   */
  notes?: TeamNoteThread[];
  currentUserId?: string | null;
}) {
  const externalUrl =
    entry.source === "flex" && entry.riotMatchId
      ? leagueOfGraphsMatchUrl(entry.riotMatchId)
      : null;

  const panel = (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {entry.source === "team" ? (
          <Link
            href={`${basePath}/team/matches/${entry.seriesId}`}
            className="text-xs font-medium text-gold-bright transition-colors hover:text-gold"
          >
            Open the series
          </Link>
        ) : (
          // No inline detail for flex, on purpose. The ten Riot IDs in this
          // lobby are exactly what this app doesn't republish, and every stat a
          // full scoreboard would add is already in the board below for our
          // five. The link is where the rest lives.
          externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-gold-bright transition-colors hover:text-gold"
            >
              Full match on League of Graphs
              <ExternalLink className="h-3 w-3" />
            </a>
          )
        )}
      </div>

      <CompareBoard
        allies={entry.allies}
        enemies={entry.enemies}
        allyBans={entry.allyBans}
        enemyBans={entry.enemyBans}
        // A team match always shows the strip, empty slots included, because a
        // half-recorded draft should look half-recorded. A Riot game either has
        // its bans or was synced before migration 024 stored them, and five
        // empty boxes there would claim nobody banned.
        showBans={entry.source === "team" || entry.allyBans.length + entry.enemyBans.length > 0}
        theirName={entry.source === "team" ? entry.opponentName : "Enemy team"}
        side={entry.side}
        durationSeconds={entry.durationSeconds}
        version={version}
        championMap={championMap}
        playerNames={playerNames}
        basePath={basePath}
      />

      {entry.source === "team" && notes !== undefined && (
        <TeamGameNotes
          gameId={entry.game.id}
          threads={notes}
          currentUserId={currentUserId ?? null}
        />
      )}
    </div>
  );

  return (
    <MatchRowShell win={entry.win} noteCount={notes?.length ?? 0} panel={panel} roomy>
      <div className="flex min-w-0 flex-1 flex-col gap-2 @2xl:flex-row @2xl:items-center @2xl:gap-4">
        <div className="flex min-w-0 items-center gap-2.5 @2xl:w-60 @2xl:shrink-0">
          <ResultLabel win={entry.win} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              <MetaChip>{entry.label}</MetaChip>
              {/* Blue picks first, so this is not decoration: without it the
                  row's own layout — ours on the left, always — is the only
                  thing a reader has, and it says nothing about the draft. */}
              <SideBadge side={entry.side} />
            </p>
            <p className="mt-0.5 truncate text-xs text-grey-mid">
              <EntrySubtitle entry={entry} />
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 @2xl:justify-center">
          <CompStrip champions={entry.allies} version={version} championMap={championMap} />
          <span className="text-[10px] font-semibold tracking-wider text-grey-mid uppercase">
            vs
          </span>
          <CompStrip
            champions={entry.enemies}
            mirrored
            version={version}
            championMap={championMap}
          />
        </div>

        <div className="shrink-0 text-xs tabular-nums text-grey-mid @2xl:w-24 @2xl:text-right">
          <p>
            {entry.durationSeconds && entry.durationSeconds > 0
              ? formatDuration(entry.durationSeconds)
              : "—"}
          </p>
          <p className="mt-0.5">{formatRelativeTime(entry.playedAt)}</p>
        </div>
      </div>
    </MatchRowShell>
  );
}
