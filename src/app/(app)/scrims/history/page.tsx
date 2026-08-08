import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadScrimGames, groupBySeries } from "@/lib/scrims/queries";
import { authorsByUserId, labelAuthors, notesByGame, threadNotes } from "@/lib/scrims/notes";
import { SCRIM_KIND_LABELS } from "@/lib/scrims/types";
import { ScrimGameCard } from "@/components/scrims/draft-board";
import { MetaChip, SeriesScore } from "@/components/scrims/scrim-ui";
import { ScrimEmptyState } from "@/components/scrims/scrim-empty-state";
import { formatRelativeTime } from "@/lib/format";

// user_id rides along purely to put a name on each note's author — see
// lib/scrims/notes.ts for why that's resolved at render time.
type RosterRow = { id: string; slug: string; display_name: string; user_id: string | null };

export default async function ScrimHistoryPage() {
  const supabase = await createClient();

  const [games, { data: roster }, version, session] = await Promise.all([
    loadScrimGames(supabase),
    supabase.from("players").select("id, slug, display_name, user_id").returns<RosterRow[]>(),
    getLatestVersion(),
    getSession(),
  ]);

  if (games.length === 0) return <ScrimEmptyState />;

  // Every game on this page in one pass, rather than a query per card.
  const [championMap, notes] = await Promise.all([
    getChampionMap(version),
    notesByGame(supabase, games.map((g) => g.id)),
  ]);
  const playerNames = new Map(
    (roster ?? []).map((p) => [p.id, { display_name: p.display_name, slug: p.slug }]),
  );
  const authors = authorsByUserId(roster ?? []);
  const series = groupBySeries(games);

  return (
    <div className="flex flex-col gap-8">
      {series.map((entry) => {
        const wins = entry.games.filter((g) => g.win).length;

        return (
          <section key={entry.series.id} className="flex flex-col gap-3">
            {/* The series header is the anchor for a block of game cards, so it
                carries the identifying facts and the cards carry none of them. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Link
                href={`/scrims/${entry.series.id}`}
                className="group flex items-center gap-1.5"
              >
                <span className="font-heading text-lg font-semibold text-white transition-colors group-hover:text-gold-bright">
                  {entry.opponent.name}
                </span>
                <ChevronRight className="h-4 w-4 text-grey-mid transition-colors group-hover:text-gold-bright" />
              </Link>
              <SeriesScore wins={wins} losses={entry.games.length - wins} />
              <MetaChip>{SCRIM_KIND_LABELS[entry.series.kind]}</MetaChip>
              {entry.series.fearless && <MetaChip>Fearless</MetaChip>}
              <span className="ml-auto text-xs text-grey-mid">
                {entry.series.played_on}
                <span className="mx-1 opacity-50">·</span>
                {formatRelativeTime(entry.series.created_at)}
              </span>
            </div>

            {entry.series.notes && (
              <p className="border-l-2 border-border pl-3 text-sm whitespace-pre-wrap text-grey-light">
                {entry.series.notes}
              </p>
            )}

            <div className="flex flex-col gap-3">
              {entry.games.map((game) => (
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
          </section>
        );
      })}
    </div>
  );
}
