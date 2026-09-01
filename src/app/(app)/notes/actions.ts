"use server";

import { revalidatePath } from "next/cache";
import { requireSessionPlayer } from "@/lib/auth";
import type { NoteFormState } from "./form-state";

const NOT_YOUR_GAME = "You can only write notes on your own games.";
const NOT_YOUR_NOTE = "You can only edit your own notes.";

// Notes are written from the match rows themselves, which render on three
// surfaces — a note write has to invalidate all of them, not one detail page.
function revalidateNoteSurfaces() {
  revalidatePath("/", "page");
  revalidatePath("/matches", "page");
  revalidatePath("/players/[slug]", "page");
}

export async function addNote(
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  try {
    const { supabase, user, player } = await requireSessionPlayer();

    const matchParticipantId = formData.get("matchParticipantId") as string;
    const note = (formData.get("note") as string)?.trim();

    if (!matchParticipantId || !note) {
      return { error: "Note text is required." };
    }

    // The shared viewer login owns no games.
    if (!player) return { error: NOT_YOUR_GAME };

    // RLS enforces this too (notes_insert_own), but checking here turns a raw
    // policy violation into a readable message.
    //
    // Deliberately the base table, not soloq_participants like the reads in
    // layout.tsx and summary.ts: this is an ownership check on one row by id,
    // and a note on a flex game is still that player's note. Scoping it to a
    // queue would reject the write with "not your game".
    const { data: participant } = await supabase
      .from("match_participants")
      .select("player_id")
      .eq("id", matchParticipantId)
      .maybeSingle();
    if (!participant || participant.player_id !== player.id) {
      return { error: NOT_YOUR_GAME };
    }

    const { error } = await supabase.from("match_notes").insert({
      match_participant_id: matchParticipantId,
      note,
      author_user_id: user.id,
    });
    if (error) return { error: error.message };
    revalidateNoteSurfaces();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function updateNote(
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  try {
    const { supabase } = await requireSessionPlayer();

    const id = formData.get("id") as string;
    const note = (formData.get("note") as string)?.trim();

    if (!id || !note) {
      return { error: "Note text is required." };
    }

    // An RLS-blocked update is not an error — it just matches zero rows, so the
    // returned rows are what actually tells us whether the write landed.
    const { data, error } = await supabase
      .from("match_notes")
      .update({ note, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: NOT_YOUR_NOTE };
    revalidateNoteSurfaces();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function deleteNote(id: string): Promise<void> {
  const { supabase } = await requireSessionPlayer();

  const { data, error } = await supabase
    .from("match_notes")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(NOT_YOUR_NOTE);
  revalidateNoteSurfaces();
}
