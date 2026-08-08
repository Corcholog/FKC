import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { formatDuration } from "@/lib/format";
import { loadSeries } from "@/lib/scrims/queries";
import { authorsByUserId, labelAuthors, notesByGame, threadNotes } from "@/lib/scrims/notes";
import { SCRIM_KIND_LABELS } from "@/lib/scrims/types";
import { ScrimGameCard } from "@/components/scrims/draft-board";
import { MetaChip, SeriesScore } from "@/components/scrims/scrim-ui";
import { DeleteSeriesButton } from "@/components/scrims/delete-series-button";

// user_id rides along purely to put a name on each note's author — see
// lib/scrims/notes.ts for why that's resolved at render time.
type RosterRow = { id: string; slug: string; display_name: string; user_id: string | null };

export default async function ScrimSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [games, { data: roster }, version, session] = await Promise.all([
    loadSeries(supabase, id),
    supabase.from("players").select("id, slug, display_name, user_id").returns<RosterRow[]>(),
    getLatestVersion(),
    getSession(),
  ]);

  // A series with no games is unreachable through the form — it always writes at
  // least one — so this is a bad id, not an empty series.
  if (games.length === 0) notFound();

  const [championMap, notes] = await Promise.all([
    getChampionMap(version),
    notesByGame(supabase, games.map((g) => g.id)),
  ]);
  const playerNames = new Map(
    (roster ?? []).map((p) => [p.id, { display_name: p.display_name, slug: p.slug }]),
  );
  const authors = authorsByUserId(roster ?? []);

  const { series, opponent } = games[0];
  const wins = games.filter((g) => g.win).length;
  const timed = games.filter((g) => g.duration_seconds && g.duration_seconds > 0);
  const totalSeconds = timed.reduce((sum, g) => sum + (g.duration_seconds ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/scrims/history"
        className="flex w-fit items-center gap-1.5 text-sm text-grey-mid transition-colors hover:text-gold-bright"
      >
        <ArrowLeft className="h-4 w-4" />
        All history
      </Link>

      <div className="panel-hex panel-hex-clip flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <div className="min-w-0">
          <Link
            href={`/scrims/opponents/${opponent.slug}`}
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
          <DeleteSeriesButton seriesId={series.id} opponentName={opponent.name} />
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
          notes={threadNotes(labelAuthors(notes.get(game.id) ?? [], authors))}
          currentUserId={session?.user.id ?? null}
        />
      ))}
    </div>
  );
}
