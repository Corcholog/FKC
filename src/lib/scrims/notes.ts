// Notes written on scrim games.
//
// A thread per game rather than one text column, because all five players
// review the same scrim and a single field is last-write-wins — see
// docs/migrations/013_scrim_game_notes.sql for the full reasoning.
//
// Shaped like lib/match-notes.ts, which does the same job for soloq games. The
// one structural difference is paging: match notes are loaded for a single page
// of match rows, whereas the scrim history page renders every game ever played,
// so this read has to survive PostgREST's silent 1000-row truncation the same
// way lib/scrims/queries.ts does.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllByIds } from "@/lib/supabase/fetch-all";

export type ScrimGameNote = {
  id: string;
  note: string;
  /** Null once the author's auth user is deleted — the note survives them. */
  author_user_id: string | null;
  /** Null on a top-level note; the *root* note's id on a reply. See threadNotes. */
  parent_note_id: string | null;
  created_at: string;
  updated_at: string;
};

type NoteRow = ScrimGameNote & { game_id: string };

const NOTE_COLUMNS =
  "id, game_id, note, author_user_id, parent_note_id, created_at, updated_at";

/**
 * Names to show against `author_user_id`, keyed by auth user id.
 *
 * Resolved through `players.user_id` at render time rather than snapshotted
 * onto the note, so renaming a player relabels their whole history instead of
 * leaving old notes under an old spelling. Anyone signed in with no roster row
 * (the shared viewer account) simply isn't in here, and their notes render
 * without a name — see ScrimGameNotes.
 */
export type NoteAuthors = Map<string, string>;

export function authorsByUserId(
  roster: Array<{ user_id: string | null; display_name: string }>,
): NoteAuthors {
  const authors: NoteAuthors = new Map();
  for (const player of roster) {
    if (player.user_id) authors.set(player.user_id, player.display_name);
  }
  return authors;
}

/** A note with its author already resolved to a name to print. */
export type LabelledScrimGameNote = ScrimGameNote & { authorLabel: string | null };

/**
 * Attaches display names before the notes cross into a client component.
 *
 * Resolving server-side keeps the lookup Map out of the RSC payload — it would
 * otherwise be serialised once per game card on a history page — and leaves the
 * note thread a plain array the client can render without knowing about the
 * roster at all.
 */
export function labelAuthors(
  notes: ScrimGameNote[],
  authors: NoteAuthors,
): LabelledScrimGameNote[] {
  return notes.map((note) => ({
    ...note,
    authorLabel: note.author_user_id ? authors.get(note.author_user_id) ?? null : null,
  }));
}

/**
 * A note as the thread renders it.
 *
 * `parent_note_id` stores the *real* parent at any depth — a reply can be
 * replied to, and that answers the reply, not the thread. What's capped is the
 * drawing, not the data: the thread renders two visual levels, and a reply
 * whose parent isn't the root says whose it is instead of indenting again. Same
 * pattern as YouTube and Instagram, and for the same reason — this sits inside
 * a card already carrying twenty champion portraits, where a fourth indent
 * level is unreadable on a phone.
 */
export type ThreadedNote = LabelledScrimGameNote & {
  /**
   * Who wrote the note this answers, when that note isn't the thread's root.
   * Null on a root, on a direct reply to one (the answer target is obvious),
   * and when the author can't be named.
   */
  replyingTo: string | null;
  /** Answers beneath it at any depth — what deleting it would take. */
  descendantCount: number;
};

/** A top-level note with every answer under it, at any depth, flattened. */
export type ScrimNoteThread = ThreadedNote & { replies: ThreadedNote[] };

/**
 * The id of the thread a note belongs to.
 *
 * Walks to the top rather than reading `parent_note_id` once, because replies
 * nest arbitrarily deep. Two things it deliberately does not do: throw, or drop
 * anything. A note whose parent is missing (it's in another game, or was
 * deleted between the two reads) becomes its own root and renders as a
 * top-level note, and so does a note caught in a parent cycle — which no insert
 * can create, since a new note has no children to point back at it, but a
 * hand-written UPDATE could. Visible and slightly wrong beats invisible.
 *
 * `seen` grows every iteration and is bounded by the note count, so this
 * terminates without an arbitrary hop cap.
 */
function rootIdOf(note: ThreadedNote, byId: Map<string, ThreadedNote>): string {
  const seen = new Set([note.id]);
  let current = note;

  for (;;) {
    if (!current.parent_note_id) return current.id;
    const parent = byId.get(current.parent_note_id);
    if (!parent) return current.id;
    if (seen.has(parent.id)) return note.id;
    seen.add(parent.id);
    current = parent;
  }
}

/** Every answer below `id`, at any depth. Cycle-safe via the shared `seen`. */
function collectDescendants(
  id: string,
  children: Map<string, ThreadedNote[]>,
  out: ThreadedNote[],
  seen: Set<string>,
): ThreadedNote[] {
  for (const child of children.get(id) ?? []) {
    if (seen.has(child.id)) continue;
    seen.add(child.id);
    out.push(child);
    collectDescendants(child.id, children, out, seen);
  }
  return out;
}

/**
 * Groups a game's notes into threads: top-level notes newest first, each
 * carrying every answer below it — at any depth — flattened into one list,
 * oldest first.
 *
 * The two orders differ because they answer different questions. The list of
 * notes is a feed, so the newest observation belongs at the top. The answers
 * under one are a conversation, and a conversation read newest-first is
 * nonsense — which is also what makes the first reply the right one to leave
 * visible when the rest are collapsed.
 */
export function threadNotes(notes: LabelledScrimGameNote[]): ScrimNoteThread[] {
  const prepared: ThreadedNote[] = notes.map((note) => ({
    ...note,
    replyingTo: null,
    descendantCount: 0,
  }));

  const byId = new Map(prepared.map((note) => [note.id, note]));

  // Resolve every note's thread up front. A note that resolves to itself heads
  // a thread; everything else hangs below one, and the two sets don't overlap —
  // which is what keeps a note from rendering twice. Without the isRoot filter
  // below, a parent cycle produces two notes that are each other's replies *and*
  // both roots, so the page shows each of them twice.
  const rootOf = new Map(prepared.map((note) => [note.id, rootIdOf(note, byId)]));
  const isRoot = (id: string) => rootOf.get(id) === id;

  const children = new Map<string, ThreadedNote[]>();
  for (const note of prepared) {
    if (!note.parent_note_id || isRoot(note.id)) continue;
    const list = children.get(note.parent_note_id) ?? [];
    list.push(note);
    children.set(note.parent_note_id, list);
  }

  const countBelow = (id: string) =>
    collectDescendants(id, children, [], new Set([id])).length;

  // Answering a direct reply to the root is the common case and needs no label
  // — the indent already says which thread it's in. Only a deeper answer, where
  // the target has scrolled out of the visual hierarchy, names who it answers.
  const describe = (note: ThreadedNote, rootId: string): ThreadedNote => {
    const parent = note.parent_note_id ? byId.get(note.parent_note_id) : undefined;
    return {
      ...note,
      descendantCount: countBelow(note.id),
      replyingTo: parent && parent.id !== rootId ? parent.authorLabel : null,
    };
  };

  const roots = prepared.filter((note) => isRoot(note.id));

  return roots.map((root) => ({
    ...describe(root, root.id),
    replies: collectDescendants(root.id, children, [], new Set([root.id]))
      .map((reply) => describe(reply, root.id))
      .sort(
        // id breaks the tie, so two answers posted in the same second don't
        // swap places between renders.
        (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      ),
  }));
}

/**
 * Notes for a set of games, newest first within each game.
 *
 * Returns a Map so a page can load every note it needs in one pass and hand
 * each game card its own list — the same fetch-once-derive-many shape the rest
 * of the scrim pages use.
 */
export async function notesByGame(
  supabase: SupabaseClient,
  gameIds: string[],
): Promise<Map<string, ScrimGameNote[]>> {
  const byGame = new Map<string, ScrimGameNote[]>();
  if (gameIds.length === 0) return byGame;

  const rows = await fetchAllByIds<NoteRow>(gameIds, (chunk, from, to) =>
    supabase
      .from("scrim_game_notes")
      .select(NOTE_COLUMNS)
      .in("game_id", chunk)
      // Total order, so `.range()` paging can't overlap or skip: two notes can
      // share a created_at, but id is the primary key. Same trap as queries.ts.
      .order("game_id")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<NoteRow[]>(),
  );

  for (const { game_id, ...note } of rows) {
    const list = byGame.get(game_id) ?? [];
    list.push(note);
    byGame.set(game_id, list);
  }
  return byGame;
}
