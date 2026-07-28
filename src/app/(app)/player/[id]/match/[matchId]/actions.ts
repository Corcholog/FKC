"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { NoteFormState } from "./notes-form-state";

async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  return supabase;
}

export async function addNote(
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  try {
    const supabase = await requireSession();

    const matchParticipantId = formData.get("matchParticipantId") as string;
    const note = (formData.get("note") as string)?.trim();
    const authorName = (formData.get("authorName") as string)?.trim();
    const playerId = formData.get("playerId") as string;
    const matchId = formData.get("matchId") as string;

    if (!matchParticipantId || !note) {
      return { error: "Note text is required." };
    }

    const { error } = await supabase.from("match_notes").insert({
      match_participant_id: matchParticipantId,
      note,
      author_name: authorName || null,
    });
    if (error) return { error: error.message };

    revalidatePath(`/player/${playerId}/match/${matchId}`);
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
    const supabase = await requireSession();

    const id = formData.get("id") as string;
    const note = (formData.get("note") as string)?.trim();
    const playerId = formData.get("playerId") as string;
    const matchId = formData.get("matchId") as string;

    if (!id || !note) {
      return { error: "Note text is required." };
    }

    const { error } = await supabase
      .from("match_notes")
      .update({ note, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };

    revalidatePath(`/player/${playerId}/match/${matchId}`);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function deleteNote(id: string, playerId: string, matchId: string): Promise<void> {
  const supabase = await requireSession();

  const { error } = await supabase.from("match_notes").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/player/${playerId}/match/${matchId}`);
}
