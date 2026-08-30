"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSessionPlayer } from "@/lib/auth";
import type { NoteFormState } from "./form-state";

const NOT_YOUR_GAME = "You can only write notes on your own games.";
const NOT_YOUR_NOTE = "You can only edit your own notes.";

// Notes are written from the match rows themselves, which render on three
// surfaces — a note write has to invalidate all of them, not one detail page.
function revalidateNoteSurfaces() {
  revalidatePath("/", "page");
  revalidatePath("/matches", "page");
  revalidatePath("/player/[slug]", "page");
}

// Notes feed the AI summaries — any add/edit/delete invalidates them. Only
// flags; generation happens in the daily /api/summaries batch, since Gemini's
// free tier is capped per day and note editing is bursty.
//
// force_regenerate, not just stale: that batch skips players with fewer than
// MIN_NEW_GAMES new games, and a note is not a game. Without the override,
// writing a note would do nothing visible until the player had queued five more
// times — for the one input the group deliberately typed in themselves.
async function markSummaryStale(supabase: SupabaseClient, playerId: string) {
  await supabase
    .from("player_ai_summaries")
    .upsert(
      { player_id: playerId, stale: true, force_regenerate: true },
      { onConflict: "player_id" },
    );
  await supabase
    .from("team_ai_summary")
    .update({ stale: true, force_regenerate: true })
    .eq("id", 1);
}

export async function addNote(
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  try {
    const { supabase, user, player } = await requireSessionPlayer();

    const matchParticipantId = formData.get("matchParticipantId") as string;
    const note = (formData.get("note") as string)?.trim();
    const playerId = formData.get("playerId") as string;

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

    await markSummaryStale(supabase, playerId);
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
    const playerId = formData.get("playerId") as string;

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

    await markSummaryStale(supabase, playerId);
    revalidateNoteSurfaces();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function deleteNote(id: string, playerId: string): Promise<void> {
  const { supabase } = await requireSessionPlayer();

  const { data, error } = await supabase
    .from("match_notes")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(NOT_YOUR_NOTE);

  await markSummaryStale(supabase, playerId);
  revalidateNoteSurfaces();
}
