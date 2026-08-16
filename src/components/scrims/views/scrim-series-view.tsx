import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatDuration } from "@/lib/format";
import type { ChampionInfo } from "@/lib/ddragon";
import type { ScrimNoteThread } from "@/lib/scrims/notes";
import { SCRIM_KIND_LABELS, type ScrimGameView } from "@/lib/scrims/types";
import { ScrimGameCard, type PlayerLookup } from "@/components/scrims/draft-board";
import { MetaChip, SeriesScore } from "@/components/scrims/scrim-ui";

// One series, game by game — /scrims/[id] and its demo.
//
// Two slots rather than two flags. `actions` is Edit and Delete, which only
// exist privately; `notesFor` is the review thread under each draft. The demo
// passes neither, so the page is the drafts and nothing else — no control that
// writes, and no thread to read.
export function ScrimSeriesView({
  games,
  version,
  championMap,
  playerNames,
  basePath = "",
  actions,
  notesFor,
  currentUserId,
}: {
  games: ScrimGameView[];
  version: string;
  championMap: Map<number, ChampionInfo>;
  playerNames: PlayerLookup;
  basePath?: string;
  actions?: ReactNode;
  notesFor?: (game: ScrimGameView) => ScrimNoteThread[];
  currentUserId?: string | null;
}) {
  const { series, opponent } = games[0];
  const wins = games.filter((g) => g.win).length;
  const timed = games.filter((g) => g.duration_seconds && g.duration_seconds > 0);
  const totalSeconds = timed.reduce((sum, g) => sum + (g.duration_seconds ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`${basePath}/scrims/history`}
        className="flex w-fit items-center gap-1.5 text-sm text-grey-mid transition-colors hover:text-gold-bright"
      >
        <ArrowLeft className="h-4 w-4" />
        All history
      </Link>

      <div className="panel-hex panel-hex-clip flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <div className="min-w-0">
          <Link
            href={`${basePath}/scrims/opponents/${opponent.slug}`}
            className="font-heading text-xl font-semibold text-white transition-colors hover:text-gold-bright"
          >
            {opponent.name}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-grey-mid">
            <span>{series.played_on}</span>
            <MetaChip>{SCRIM_KIND_LABELS[series.kind]}</MetaChip>
            {series.fearless && <MetaChip>Fearless</MetaChip>}
            <span>
              {games.length} game{games.length === 1 ? "" : "s"}
              {/* Only counts the games that recorded a duration, and says so —
                  an unlabelled total would read as the whole block. */}
              {timed.length > 0 && (
                <>
                  {" · "}
                  {formatDuration(totalSeconds)}
                  {timed.length < games.length && ` over ${timed.length}`}
                </>
              )}
            </span>
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <SeriesScore wins={wins} losses={games.length - wins} className="text-2xl" />
          {actions}
        </div>
      </div>

      {series.notes && (
        <p className="panel-hex p-4 text-sm whitespace-pre-wrap text-grey-light">{series.notes}</p>
      )}

      {games.map((game) => (
        <ScrimGameCard
          key={game.id}
          game={game}
          version={version}
          championMap={championMap}
          playerNames={playerNames}
          notes={notesFor?.(game)}
          currentUserId={currentUserId}
          basePath={basePath}
        />
      ))}
    </div>
  );
}
