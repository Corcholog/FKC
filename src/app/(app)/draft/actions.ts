"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { getChampionMap, getLatestVersion, type ChampionInfo } from "@/lib/ddragon";
import { slugify } from "@/lib/slug";
import { loadDraftTags } from "@/lib/draft/queries";
import {
  cleanText,
  validateChampionCounter,
  validateChampionProfile,
  validateDraftTag,
  type ChampionCounterInput,
  type ChampionProfileInput,
} from "@/lib/draft/validate";
import {
  isEmptyProfile,
  MAX_COUNTER_NOTE_CHARS,
  MAX_PROFILE_NOTE_CHARS,
  MAX_TAG_LABEL_CHARS,
  type DraftTagKind,
  type DraftTagRow,
} from "@/lib/draft/types";

// Typed arguments, not FormData: a profile carries two arrays and a tag needs
// its kind alongside its label, and serializing either into a hidden input
// would buy nothing. Same call as tierlists/actions.ts and scrims/actions.ts.

export type DraftActionResult = { error?: string };

async function championsForWrite(): Promise<Map<number, ChampionInfo>> {
  const map = await getChampionMap(await getLatestVersion());
  if (map.size === 0) throw new Error("Champion data is unavailable right now — try again in a minute.");
  return map;
}

export async function saveChampionProfile(input: ChampionProfileInput): Promise<DraftActionResult> {
  try {
    const { supabase, user } = await requireSession();

    const championMap = await championsForWrite();
    const tagSlugs = new Set((await loadDraftTags(supabase, "function")).map((t) => t.slug));

    const problem = validateChampionProfile(input, new Set(championMap.keys()), tagSlugs);
    if (problem) return { error: problem };

    const notes = cleanText(input.notes, MAX_PROFILE_NOTE_CHARS);

    // A champion with nothing set isn't "annotated" — see isEmptyProfile's
    // comment. Upserting empty arrays instead of deleting would leave the row
    // behind forever, so it would keep counting as annotated after the last
    // role/tag/note was cleared. Nothing else references champion_profiles by
    // row existence, so deleting here is safe.
    if (isEmptyProfile({ roles: input.roles, tags: input.tags, notes })) {
      const { error } = await supabase.from("champion_profiles").delete().eq("champion_id", input.championId);
      if (error) return { error: error.message };
      revalidatePath("/draft/champions");
      return {};
    }

    const { data, error } = await supabase
      .from("champion_profiles")
      .upsert(
        {
          champion_id: input.championId,
          roles: input.roles,
          tags: input.tags,
          notes,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: "champion_id" },
      )
      .select("champion_id");

    if (error) return { error: error.message };
    // RLS refusals come back as zero rows rather than an error.
    if (!data || data.length === 0) return { error: "That save was blocked. Try signing out and back in." };

    revalidatePath("/draft/champions");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save that champion." };
  }
}

export type CreateDraftTagResult = DraftActionResult & { tag?: DraftTagRow };

export async function createDraftTag(input: {
  label: string;
  kind: DraftTagKind;
}): Promise<CreateDraftTagResult> {
  try {
    const { supabase } = await requireSession();

    const problem = validateDraftTag(input);
    if (problem) return { error: problem };

    const label = cleanText(input.label, MAX_TAG_LABEL_CHARS)!;
    const slug = slugify(label);
    if (!slug) return { error: "That label has nothing usable in it." };

    const { data, error } = await supabase
      .from("draft_tags")
      .insert({ slug, label, kind: input.kind })
      .select("id, slug, label, kind, created_at")
      .single<DraftTagRow>();

    if (error) {
      return {
        error: error.code === "23505" ? "That tag already exists." : error.message,
      };
    }
    if (!data) return { error: "That save was blocked. Try signing out and back in." };

    revalidatePath("/draft/champions");
    return { tag: data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create that tag." };
  }
}

export async function renameDraftTag(id: string, label: string): Promise<DraftActionResult> {
  try {
    const { supabase } = await requireSession();

    const clean = cleanText(label, MAX_TAG_LABEL_CHARS);
    if (!clean) return { error: "A tag needs a label." };

    const { data, error } = await supabase
      .from("draft_tags")
      .update({ label: clean })
      .eq("id", id)
      .select("id");

    if (error) {
      return { error: error.code === "23505" ? "Another tag already has that label." : error.message };
    }
    if (!data || data.length === 0) return { error: "That tag no longer exists." };

    revalidatePath("/draft/champions");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not rename that tag." };
  }
}

/**
 * Deletes a tag and strips it from every champion that carries it.
 *
 * champion_profiles.tags is a plain array column, so the cleanup has to
 * happen in JS rather than via array_remove() in a single statement — the
 * query builder has no SQL escape hatch. This table is small enough (at most
 * ~170 rows, and only the few carrying this tag get touched) that a sequential
 * pass is the honest choice, same reasoning as fetchAllByIds' chunking: a
 * page render is a worse place for a burst of parallel writes than for a few
 * extra round trips.
 */
export async function deleteDraftTag(id: string): Promise<DraftActionResult> {
  try {
    const { supabase } = await requireSession();

    const { data: tag } = await supabase
      .from("draft_tags")
      .select("slug")
      .eq("id", id)
      .maybeSingle<{ slug: string }>();
    if (!tag) return { error: "That tag was already removed." };

    const { data: carriers } = await supabase
      .from("champion_profiles")
      .select("champion_id, tags")
      .contains("tags", [tag.slug])
      .returns<{ champion_id: number; tags: string[] }[]>();

    for (const row of carriers ?? []) {
      await supabase
        .from("champion_profiles")
        .update({ tags: row.tags.filter((slug) => slug !== tag.slug) })
        .eq("champion_id", row.champion_id);
    }

    const { data, error } = await supabase.from("draft_tags").delete().eq("id", id).select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "That tag was already removed." };

    revalidatePath("/draft/champions");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not delete that tag." };
  }
}

function revalidateCounters() {
  revalidatePath("/draft/counters");
  revalidatePath("/draft/champions");
}

/**
 * Upserts on the directed pair — re-noting an existing matchup edits it rather
 * than erroring. Checks for the existing row first, rather than a single
 * .upsert() call, specifically so an edit never touches created_by: that
 * column means "who wrote the original take," and a plain upsert would
 * silently reassign it to whoever last edited the note.
 */
export async function saveChampionCounter(input: ChampionCounterInput): Promise<DraftActionResult> {
  try {
    const { supabase, user } = await requireSession();

    const championMap = await championsForWrite();
    const problem = validateChampionCounter(input, new Set(championMap.keys()));
    if (problem) return { error: problem };

    const note = cleanText(input.note, MAX_COUNTER_NOTE_CHARS);

    const { data: existing } = await supabase
      .from("champion_counters")
      .select("id")
      .eq("counter_champion_id", input.counterChampionId)
      .eq("target_champion_id", input.targetChampionId)
      .maybeSingle<{ id: string }>();

    const { data, error } = existing
      ? await supabase
          .from("champion_counters")
          .update({ note, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select("id")
      : await supabase
          .from("champion_counters")
          .insert({
            counter_champion_id: input.counterChampionId,
            target_champion_id: input.targetChampionId,
            note,
            created_by: user.id,
          })
          .select("id");

    if (error) {
      // The unique-pair race: two people saving the same new matchup at once.
      return { error: error.code === "23505" ? "That matchup is already noted." : error.message };
    }
    if (!data || data.length === 0) return { error: "That save was blocked. Try signing out and back in." };

    revalidateCounters();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save that matchup." };
  }
}

export async function deleteChampionCounter(id: string): Promise<DraftActionResult> {
  try {
    const { supabase } = await requireSession();

    const { data, error } = await supabase.from("champion_counters").delete().eq("id", id).select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "That matchup was already removed." };

    revalidateCounters();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not delete that matchup." };
  }
}
