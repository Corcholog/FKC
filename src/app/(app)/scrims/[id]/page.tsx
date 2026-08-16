import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { rows } from "@/lib/supabase/read";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { loadSeries } from "@/lib/scrims/queries";
import { authorsByUserId, labelAuthors, notesByGame, threadNotes } from "@/lib/scrims/notes";
import { ScrimSeriesView } from "@/components/scrims/views/scrim-series-view";
import { DeleteSeriesButton } from "@/components/scrims/delete-series-button";
// A Link styled as a button, not a Button rendering a Link — base-ui's Button
// wants a real <button> underneath. Same call as tierlists/page.tsx.
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// user_id rides along purely to put a name on each note's author — see
// lib/scrims/notes.ts for why that's resolved at render time.
type RosterRow = { id: string; slug: string; display_name: string; user_id: string | null };

export default async function ScrimSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [games, rosterResult, version, session] = await Promise.all([
    loadSeries(privateSource(supabase), id),
    supabase.from("players").select("id, slug, display_name, user_id").returns<RosterRow[]>(),
    getLatestVersion(),
    getSession(),
  ]);

  // A series with no games is unreachable through the form — it always writes at
  // least one — so this is a bad id, not an empty series.
  if (games.length === 0) notFound();

  const [championMap, notes] = await Promise.all([
    getChampionMap(version),
    notesByGame(
      supabase,
      games.map((g) => g.id),
    ),
  ]);

  const roster = rows(rosterResult, "roster");
  const authors = authorsByUserId(roster);
  const { series, opponent } = games[0];

  return (
    <ScrimSeriesView
      games={games}
      version={version}
      championMap={championMap}
      playerNames={
        new Map(roster.map((p) => [p.id, { display_name: p.display_name, slug: p.slug }]))
      }
      notesFor={(game) => threadNotes(labelAuthors(notes.get(game.id) ?? [], authors))}
      currentUserId={session?.user.id ?? null}
      actions={
        <div className="flex items-center gap-1">
          <Link
            href={`/scrims/${series.id}/edit`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Pencil />
            Edit
          </Link>
          <DeleteSeriesButton seriesId={series.id} opponentName={opponent.name} />
        </div>
      }
    />
  );
}
