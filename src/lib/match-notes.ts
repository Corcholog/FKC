import type { SupabaseClient } from "@supabase/supabase-js";

export type MatchNote = {
  id: string;
  note: string;
  author_user_id: string | null;
  author_name: string | null;
  created_at: string;
};

type NoteRow = MatchNote & { match_participant_id: string };

/**
 * Notes for a page's worth of rendered match rows, keyed by participant id.
 *
 * Notes hang off match_participants, not matches — one game that several
 * tracked players were in renders a row each, and each row gets only that
 * player's notes. RLS (notes_select_all) lets any signed-in user read them all,
 * so there's nothing to filter by author here; who may *write* is decided per
 * row by the caller.
 */
export async function notesByParticipant(
  supabase: SupabaseClient,
  participantIds: string[],
): Promise<Map<string, MatchNote[]>> {
  const byParticipant = new Map<string, MatchNote[]>();
  if (participantIds.length === 0) return byParticipant;

  const { data } = await supabase
    .from("match_notes")
    .select("id, note, author_user_id, author_name, created_at, match_participant_id")
    .in("match_participant_id", participantIds)
    .order("created_at", { ascending: false })
    .returns<NoteRow[]>();

  for (const { match_participant_id, ...note } of data ?? []) {
    const list = byParticipant.get(match_participant_id) ?? [];
    list.push(note);
    byParticipant.set(match_participant_id, list);
  }
  return byParticipant;
}
