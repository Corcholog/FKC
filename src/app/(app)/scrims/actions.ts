"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireSession } from "@/lib/auth";
import { getChampionMap, getLatestVersion, type ChampionInfo } from "@/lib/ddragon";
import { opponentSlug } from "@/lib/slug";
import type { ScrimPickRow } from "@/lib/scrims/types";
import {
  cleanBanPlan,
  cleanText,
  validateSeries,
  MAX_NAME_CHARS,
  MAX_NOTE_CHARS,
  type ScrimGameInput,
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

/** What an RLS refusal looks like from here: no error, no rows. */
const BLOCKED = "That save was blocked. Try signing out and back in.";

/**
 * The champion list both write paths validate against — never the one the
 * client sent, which may be a patch behind.
 *
 * Throws rather than returning, because an empty map is DDragon's degraded
 * state (see lib/ddragon.ts) and not a fault in what was entered: validating
 * against it would reject every champion in the draft and blame the user for
 * it. Both callers turn the throw back into this sentence.
 */
async function championsForWrite(): Promise<Map<number, ChampionInfo>> {
  const map = await getChampionMap(await getLatestVersion());
  if (map.size === 0) {
    throw new Error("Champion data is unavailable right now — try again in a minute.");
  }
  return map;
}

/**
 * The columns of scrim_games an entered game owns.
 *
 * `patch` used to be absent here, because nothing entered it — which meant no
 * recorded game had one and "how did we look on this patch" could not be
 * answered at all. The form now prefills it from the current DDragon version,
 * so it is written like any other field. It is still nullable: a series entered
 * before the field existed keeps its null, and the edit form shows that blank
 * rather than stamping today's patch onto an old game.
 */
function gameFields(game: ScrimGameInput, gameNumber: number) {
  return {
    game_number: gameNumber,
    side: game.side,
    win: game.win,
    duration_seconds: game.durationSeconds,
    patch: game.patch,
    ally_bans: game.allyBans,
    enemy_bans: game.enemyBans,
  };
}

/** The ten scrim_picks rows of one game. */
function pickRows(
  gameId: string,
  game: ScrimGameInput,
  championMap: Map<number, ChampionInfo>,
) {
  return game.picks.map((pick) => ({
    game_id: gameId,
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
  }));
}

export async function saveScrimSeries(input: ScrimSeriesInput): Promise<ScrimActionResult> {
  let createdSeriesId: string | null = null;
  let supabase: Awaited<ReturnType<typeof requireSession>>["supabase"] | null = null;

  try {
    const session = await requireSession();
    supabase = session.supabase;

    // Never trust what came off the wire.
    const championMap = await championsForWrite();
    const invalid = validateSeries(input, new Set(championMap.keys()));
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
    if (!series) return { error: BLOCKED };
    createdSeriesId = series.id;

    const { data: games, error: gamesError } = await supabase
      .from("scrim_games")
      .insert(
        input.games.map((game, index) => ({
          series_id: series.id,
          ...gameFields(game, index + 1),
        })),
      )
      .select("id, game_number")
      .returns<{ id: string; game_number: number }[]>();

    if (gamesError) throw new Error(gamesError.message);
    if (!games || games.length !== input.games.length) throw new Error(BLOCKED);

    const gameIdByNumber = new Map(games.map((g) => [g.game_number, g.id]));
    const { error: picksError } = await supabase.from("scrim_picks").insert(
      input.games.flatMap((game, index) =>
        pickRows(gameIdByNumber.get(index + 1) as string, game, championMap),
      ),
    );
    if (picksError) throw new Error(picksError.message);

    // A note typed while entering the game becomes the first note in that
    // game's thread, authored by whoever entered it. One concept for "notes on
    // this game" rather than an entry-time field sitting next to a thread that
    // says the same thing.
    const noteRows = input.games.flatMap((game, index) => {
      const note = cleanText(game.notes, MAX_NOTE_CHARS);
      if (!note) return [];
      return [
        {
          game_id: gameIdByNumber.get(index + 1) as string,
          note,
          author_user_id: session.user.id,
        },
      ];
    });
    if (noteRows.length > 0) {
      const { error: notesError } = await supabase.from("scrim_game_notes").insert(noteRows);
      if (notesError) throw new Error(notesError.message);
    }

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

// ------------------------------------------------------------
// Editing a series that already exists
// ------------------------------------------------------------

const STALE = "This series changed while you were editing it — reload and try again.";

/** A pick as it was, so a failed rewrite can put it back exactly. */
type PickBackup = ScrimPickRow & { created_at: string };

const PICK_BACKUP_COLUMNS =
  "id, game_id, ally, team_position, champion_id, champion_name, player_id, player_name, kills, deaths, assists, total_cs, created_at";

/**
 * Rewrites a series that already exists, in place.
 *
 * Deliberately *not* "delete it and save it again". scrim_game_notes hangs off
 * scrim_games.id with `on delete cascade`, so recreating the games would take
 * five people's written review of them along with it — silently, to fix a
 * mistyped CS number. Every game the editor still shows therefore keeps the row
 * it came from, and only games the user actually removed are deleted.
 *
 * `created_by` is left alone for the same reason it exists: it says who entered
 * the series, not who last touched it, and anyone may correct anyone's entry
 * (docs/migrations/012_scrims.sql).
 */
export async function updateScrimSeries(
  seriesId: string,
  input: ScrimSeriesInput,
): Promise<ScrimActionResult> {
  let supabase: Awaited<ReturnType<typeof requireSession>>["supabase"] | null = null;
  // The old drafts, held from the moment they're deleted until the new ones
  // land. Null at every other point, which is what stops the catch below from
  // "restoring" over rows nothing ever touched.
  let dropped: { gameIds: string[]; picks: PickBackup[] } | null = null;

  try {
    ({ supabase } = await requireSession());
    if (!seriesId) return { error: "Missing series." };

    const championMap = await championsForWrite();
    const invalid = validateSeries(input, new Set(championMap.keys()));
    if (invalid) return { error: invalid };

    // The series as it actually stands. Everything below is expressed against
    // these rows rather than against what the client claims exists.
    const { data: existing, error: existingError } = await supabase
      .from("scrim_games")
      .select("id, game_number")
      .eq("series_id", seriesId)
      .order("game_number")
      .returns<{ id: string; game_number: number }[]>();

    if (existingError) return { error: existingError.message };
    if (!existing || existing.length === 0) {
      return { error: "There was no series to edit." };
    }

    // Two invariants, both upheld by the form (it appends and removes games,
    // it never reorders them): a game that survives the edit keeps its place in
    // playing order, and added games come last. They're what make the
    // renumbering below safe without a transaction — see the loop that does it.
    // A payload that breaks either is refused rather than half-written.
    const numberById = new Map(existing.map((g) => [g.id, g.game_number]));
    const kept = new Set<string>();
    let previousNumber = 0;
    let sawNewGame = false;

    for (const game of input.games) {
      if (!game.id) {
        sawNewGame = true;
        continue;
      }
      const number = numberById.get(game.id);
      // An id from another series, or the same game claimed twice: this payload
      // was built against something other than the series as it is now.
      if (number === undefined || kept.has(game.id)) return { error: STALE };
      if (sawNewGame || number < previousNumber) {
        return { error: "Games can't be reordered — remove and re-enter them instead." };
      }
      kept.add(game.id);
      previousNumber = number;
    }

    const opponent = await resolveOpponent(supabase, input.opponentId, input.opponentName);
    if ("error" in opponent) return { error: opponent.error };

    const { data: series, error: seriesError } = await supabase
      .from("scrim_series")
      .update({
        opponent_id: opponent.id,
        played_on: input.playedOn,
        kind: input.kind,
        fearless: input.fearless,
        notes: cleanText(input.notes, MAX_NOTE_CHARS),
      })
      .eq("id", seriesId)
      .select("id");

    if (seriesError) return { error: seriesError.message };
    if (!series || series.length === 0) return { error: BLOCKED };

    // Games the edit dropped go first, before anything is renumbered: it frees
    // the numbers the survivors are about to take, and it's the one destructive
    // step the user explicitly asked for. Their note threads go with them —
    // that's the cascade, and it's what the editor warns about rather than
    // something to undo here.
    const removed = existing.filter((g) => !kept.has(g.id));
    if (removed.length > 0) {
      const { error } = await supabase
        .from("scrim_games")
        .delete()
        .in(
          "id",
          removed.map((g) => g.id),
        );
      if (error) return { error: error.message };
    }

    // Picks are replaced wholesale rather than diffed: ten rows a game, and
    // working out which of them changed role is more code than rewriting all
    // ten. There's no transaction around the delete and the insert, so the rows
    // about to be dropped are read first and go back exactly as they were if
    // the insert fails.
    const keptIds = [...kept];
    let backup: PickBackup[] = [];
    if (keptIds.length > 0) {
      const { data, error } = await supabase
        .from("scrim_picks")
        .select(PICK_BACKUP_COLUMNS)
        .in("game_id", keptIds)
        .returns<PickBackup[]>();
      if (error) return { error: error.message };
      backup = data ?? [];
    }

    // Surviving games take their new position one at a time, in ascending
    // order, and that order is the whole trick: by the time position k is
    // assigned, every row that could have been holding k has already moved
    // below it or been deleted, so the unique (series_id, game_number) index is
    // never violated mid-flight.
    const gameIdByIndex = new Map<number, string>();
    for (const [index, game] of input.games.entries()) {
      if (!game.id) continue;
      const { error } = await supabase
        .from("scrim_games")
        .update(gameFields(game, index + 1))
        .eq("id", game.id);
      if (error) throw new Error(error.message);
      gameIdByIndex.set(index, game.id);
    }

    const added = input.games
      .map((game, index) => ({ game, index }))
      .filter(({ game }) => !game.id);

    if (added.length > 0) {
      const { data, error } = await supabase
        .from("scrim_games")
        .insert(
          added.map(({ game, index }) => ({ series_id: seriesId, ...gameFields(game, index + 1) })),
        )
        .select("id, game_number")
        .returns<{ id: string; game_number: number }[]>();

      if (error) throw new Error(error.message);
      if (!data || data.length !== added.length) throw new Error(BLOCKED);

      const idByNumber = new Map(data.map((g) => [g.game_number, g.id]));
      for (const { index } of added) gameIdByIndex.set(index, idByNumber.get(index + 1) as string);
    }

    if (keptIds.length > 0) {
      const { error } = await supabase.from("scrim_picks").delete().in("game_id", keptIds);
      if (error) throw new Error(error.message);
      dropped = { gameIds: keptIds, picks: backup };
    }

    const { error: picksError } = await supabase.from("scrim_picks").insert(
      input.games.flatMap((game, index) =>
        pickRows(gameIdByIndex.get(index) as string, game, championMap),
      ),
    );
    if (picksError) throw new Error(picksError.message);

    revalidateScrims();
    return { seriesId };
  } catch (e) {
    // saveScrimSeries' compensating rollback, in the only shape an update can
    // take — deleting the series would be far worse than the failure. Just the
    // drafts, and only when they were actually dropped: a game left with the
    // wrong number or duration is visibly wrong and fixable in a second pass,
    // whereas a game left with no draft at all is gone for good.
    if (supabase && dropped) {
      await supabase.from("scrim_picks").delete().in("game_id", dropped.gameIds);
      if (dropped.picks.length > 0) await supabase.from("scrim_picks").insert(dropped.picks);
      revalidateScrims();
    }
    return { error: e instanceof Error ? e.message : "Could not save those changes." };
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
    if (!data || data.length === 0) return { error: BLOCKED };

    revalidatePath("/scrims/opponents", "page");
    revalidatePath("/scrims/opponents/[slug]", "page");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save those notes." };
  }
}

/**
 * The ban plan for one opponent — which champions we intend to take off them.
 *
 * Validated against the live DDragon champion list rather than trusted, for the
 * same reason `saveScrimSeries` is: a server action is a POST endpoint, so the
 * fact that our own picker only offers real champions proves nothing about what
 * arrives here. `cleanBanPlan` drops anything unknown or duplicated and keeps
 * the order, which is the priority — first in the array is first off the board.
 */
export async function updateOpponentBanPlan(
  opponentId: string,
  championIds: number[],
): Promise<ScrimActionResult> {
  try {
    const { supabase } = await requireSession();
    if (!opponentId) return { error: "Missing opponent." };

    const championMap = await getChampionMap(await getLatestVersion());
    // An empty map means DDragon is down, and cleaning against it would silently
    // wipe the plan. Refusing is the only honest option: the alternative is a
    // save that reports success and deletes the prep.
    if (championMap.size === 0) {
      return { error: "Champion list unavailable right now — try again in a moment." };
    }

    const { data, error } = await supabase
      .from("scrim_opponents")
      .update({ target_bans: cleanBanPlan(championIds, new Set(championMap.keys())) })
      .eq("id", opponentId)
      .select("id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: BLOCKED };

    revalidatePath("/scrims/opponents", "page");
    revalidatePath("/scrims/opponents/[slug]", "page");
    // The ban plan is the one column on this table the demo actually renders —
    // `notes` reaches it through demo_text, but target_bans passes straight
    // through the view. Without this it would sit behind the hour-long demo
    // cache, which reads as the save not having worked. revalidateTag rather
    // than updateTag for the reason settings/actions.ts gives: unstable_cache's
    // `tags` option is documented against revalidateTag.
    revalidateTag("demo", "max");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save that ban plan." };
  }
}

// ------------------------------------------------------------
// Notes on a game
// ------------------------------------------------------------
// A thread, not a field: everyone played the scrim, so everyone writes, and a
// single shared column would be last-write-wins. See
// docs/migrations/013_scrim_game_notes.sql.
//
// Anyone signed in may add one — unlike soloq notes, where addNote checks the
// game belongs to you first. There's no equivalent check to make here, and RLS
// says the same thing. Editing and deleting stay author-only, which RLS
// enforces; the zero-rows check below is what turns a silent refusal into a
// sentence.

const NOT_YOUR_NOTE = "You can only edit your own notes.";

export async function addScrimGameNote(
  gameId: string,
  note: string,
  /** The note being answered, or null for a new top-level note. */
  parentNoteId: string | null = null,
): Promise<ScrimActionResult> {
  try {
    const { supabase, user } = await requireSession();
    if (!gameId) return { error: "Missing game." };

    const text = cleanText(note, MAX_NOTE_CHARS);
    if (!text) return { error: "Write something first." };

    // The parent is stored as given, at whatever depth: a reply can be replied
    // to, and that answers the reply rather than the thread. Depth is capped in
    // the *rendering* (threadNotes flattens to two visual levels and names who
    // a deeper answer is for), not in the data — collapsing it here would
    // silently rewrite what somebody was answering.
    //
    // An insert can't create a parent cycle: a note that doesn't exist yet has
    // nothing pointing at it.
    //
    // The game check isn't paranoia about our own UI — actions are reachable by
    // direct POST, and a reply pointed at another game's note would render
    // under a draft nobody wrote it about.
    if (parentNoteId) {
      const { data: target } = await supabase
        .from("scrim_game_notes")
        .select("id, game_id")
        .eq("id", parentNoteId)
        .maybeSingle<{ id: string; game_id: string }>();

      if (!target || target.game_id !== gameId) {
        return { error: "That note is gone — reload the page." };
      }
    }

    const { data, error } = await supabase
      .from("scrim_game_notes")
      .insert({
        game_id: gameId,
        note: text,
        author_user_id: user.id,
        parent_note_id: parentNoteId,
      })
      .select("id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return { error: "That note was blocked. Try signing out and back in." };
    }

    revalidateScrimNotes();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save that note." };
  }
}

export async function updateScrimGameNote(
  noteId: string,
  note: string,
): Promise<ScrimActionResult> {
  try {
    const { supabase } = await requireSession();
    if (!noteId) return { error: "Missing note." };

    const text = cleanText(note, MAX_NOTE_CHARS);
    if (!text) return { error: "Write something first." };

    const { data, error } = await supabase
      .from("scrim_game_notes")
      .update({ note: text, updated_at: new Date().toISOString() })
      .eq("id", noteId)
      .select("id");

    if (error) return { error: error.message };
    // An RLS-blocked update isn't an error, it just matches nothing.
    if (!data || data.length === 0) return { error: NOT_YOUR_NOTE };

    revalidateScrimNotes();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save that note." };
  }
}

export async function deleteScrimGameNote(noteId: string): Promise<ScrimActionResult> {
  try {
    const { supabase } = await requireSession();
    if (!noteId) return { error: "Missing note." };

    const { data, error } = await supabase
      .from("scrim_game_notes")
      .delete()
      .eq("id", noteId)
      .select("id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: NOT_YOUR_NOTE };

    revalidateScrimNotes();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not delete that note." };
  }
}

/**
 * Only the two surfaces that render notes. Deliberately narrower than
 * revalidateScrims(): a note changes no aggregate, so throwing away the drafts
 * and opponent pages would be recomputing every stat on the site because
 * somebody typed a sentence.
 */
function revalidateScrimNotes() {
  revalidatePath("/scrims/history");
  revalidatePath("/scrims/[id]", "page");
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
