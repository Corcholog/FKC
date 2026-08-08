"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { getChampionMap, getLatestVersion } from "@/lib/ddragon";
import { opponentSlug } from "@/lib/slug";
import {
  cleanText,
  validateSeries,
  MAX_NAME_CHARS,
  MAX_NOTE_CHARS,
  type ScrimSeriesInput,
} from "@/lib/scrims/validate";

// Typed arguments rather than FormData, same call as tierlists/actions.ts: a
// series is a nested structure and a form would mean serialising it into a
// hidden input and parsing it back for nothing. Still invoked from a
// transition, so pending state works the same as the FormData actions.
//
// Validation lives in lib/scrims/validate.ts — a "use server" module may only
// export async server functions, so keeping it here would make it untestable.

export type ScrimActionResult = { error?: string; seriesId?: string };

/** Finds an opponent by name (case-insensitively) or creates one. */
async function resolveOpponent(
  supabase: Awaited<ReturnType<typeof requireSession>>["supabase"],
  opponentId: string | null,
  rawName: string,
): Promise<{ id: string } | { error: string }> {
  if (opponentId) return { id: opponentId };

  const name = cleanText(rawName, MAX_NAME_CHARS);
  if (!name) return { error: "That opponent name is empty." };

  const slug = opponentSlug(name);
  if (!slug) return { error: "That opponent name has no letters or numbers in it." };

  // The unique index is on lower(name), so look the same way rather than
  // relying on upsert — a name that differs only in case is the same team.
  const { data: existing } = await supabase
    .from("scrim_opponents")
    .select("id")
    .ilike("name", name)
    .maybeSingle<{ id: string }>();
  if (existing) return { id: existing.id };

  const { data, error } = await supabase
    .from("scrim_opponents")
    .insert({ name, slug })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { error: error.message };
  if (!data) return { error: "Creating that opponent was blocked. Try signing out and back in." };
  return { id: data.id };
}

export async function saveScrimSeries(input: ScrimSeriesInput): Promise<ScrimActionResult> {
  let createdSeriesId: string | null = null;
  let supabase: Awaited<ReturnType<typeof requireSession>>["supabase"] | null = null;

  try {
    const session = await requireSession();
    supabase = session.supabase;

    // Never trust what came off the wire, and never trust a champion list the
    // client might be a patch behind on.
    const championMap = await getChampionMap(await getLatestVersion());
    const validChampionIds = new Set(championMap.keys());
    // An empty map is DDragon's degraded state (see lib/ddragon.ts). Validating
    // against it would reject every champion, so refuse the save outright
    // instead of blaming the user's draft.
    if (validChampionIds.size === 0) {
      return { error: "Champion data is unavailable right now — try again in a minute." };
    }

    const invalid = validateSeries(input, validChampionIds);
    if (invalid) return { error: invalid };

    const opponent = await resolveOpponent(supabase, input.opponentId, input.opponentName);
    if ("error" in opponent) return { error: opponent.error };

    const { data: series, error: seriesError } = await supabase
      .from("scrim_series")
      .insert({
        opponent_id: opponent.id,
        played_on: input.playedOn,
        kind: input.kind,
        fearless: input.fearless,
        notes: cleanText(input.notes, MAX_NOTE_CHARS),
        created_by: session.user.id,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (seriesError) return { error: seriesError.message };
    // RLS refusals come back as zero rows rather than an error.
    if (!series) return { error: "That save was blocked. Try signing out and back in." };
    createdSeriesId = series.id;

    const { data: games, error: gamesError } = await supabase
      .from("scrim_games")
      .insert(
        input.games.map((game, index) => ({
          series_id: series.id,
          game_number: index + 1,
          side: game.side,
          win: game.win,
          duration_seconds: game.durationSeconds,
          ally_bans: game.allyBans,
          enemy_bans: game.enemyBans,
          notes: cleanText(game.notes, MAX_NOTE_CHARS),
        })),
      )
      .select("id, game_number")
      .returns<{ id: string; game_number: number }[]>();

    if (gamesError) throw new Error(gamesError.message);
    if (!games || games.length !== input.games.length) {
      throw new Error("That save was blocked. Try signing out and back in.");
    }

    const gameIdByNumber = new Map(games.map((g) => [g.game_number, g.id]));
    const pickRows = input.games.flatMap((game, index) =>
      game.picks.map((pick) => ({
        game_id: gameIdByNumber.get(index + 1) as string,
        ally: pick.ally,
        team_position: pick.teamPosition,
        champion_id: pick.championId,
        champion_name: championMap.get(pick.championId)?.ddragonId ?? String(pick.championId),
        player_id: pick.ally ? pick.playerId : null,
        player_name: cleanText(pick.playerName, MAX_NAME_CHARS),
        kills: pick.kills,
        deaths: pick.deaths,
        assists: pick.assists,
        total_cs: pick.totalCs,
      })),
    );

    const { error: picksError } = await supabase.from("scrim_picks").insert(pickRows);
    if (picksError) throw new Error(picksError.message);

    revalidateScrims();
    return { seriesId: series.id };
  } catch (e) {
    // PostgREST has no client-side transaction and this writes three tables, so
    // a failure partway leaves a half-entered series. Deleting the parent is
    // the compensating rollback: `on delete cascade` takes the games and picks
    // with it. Better a lost save than a series that looks complete and isn't.
    if (createdSeriesId && supabase) {
      await supabase.from("scrim_series").delete().eq("id", createdSeriesId);
    }
    return { error: e instanceof Error ? e.message : "Could not save that series." };
  }
}

export async function deleteScrimSeries(seriesId: string): Promise<ScrimActionResult> {
  try {
    const { supabase } = await requireSession();
    if (!seriesId) return { error: "Missing series." };

    const { data, error } = await supabase
      .from("scrim_series")
      .delete()
      .eq("id", seriesId)
      .select("id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "There was no series to delete." };

    revalidateScrims();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not delete that series." };
  }
}

export async function updateOpponentNotes(
  opponentId: string,
  notes: string,
): Promise<ScrimActionResult> {
  try {
    const { supabase } = await requireSession();
    if (!opponentId) return { error: "Missing opponent." };

    const { data, error } = await supabase
      .from("scrim_opponents")
      .update({ notes: cleanText(notes, MAX_NOTE_CHARS) })
      .eq("id", opponentId)
      .select("id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "That save was blocked. Try signing out and back in." };

    revalidatePath("/scrims/opponents", "page");
    revalidatePath("/scrims/opponents/[slug]", "page");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save those notes." };
  }
}

/**
 * Every scrim page derives from the same rows, so one write invalidates all of
 * them. Cheap: they're dynamic already, and missing one leaves a stat page
 * disagreeing with the history it was built from.
 */
function revalidateScrims() {
  revalidatePath("/scrims");
  revalidatePath("/scrims/history");
  revalidatePath("/scrims/drafts");
  revalidatePath("/scrims/opponents");
  revalidatePath("/scrims/opponents/[slug]", "page");
  revalidatePath("/scrims/[id]", "page");
}
