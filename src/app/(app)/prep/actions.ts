"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { privateSource } from "@/lib/data-source";
import { getChampionMap, getLatestVersion, type ChampionInfo } from "@/lib/ddragon";
import { slugify } from "@/lib/slug";
import { loadDraftTags } from "@/lib/draft/queries";
import {
  cleanText,
  validateChampionProfile,
  validateCounterGroup,
  validateDraftComp,
  validateDraftTag,
  type ChampionProfileInput,
  type CounterGroupInput,
  type DraftCompInput,
} from "@/lib/draft/validate";
import {
  isEmptyProfile,
  MAX_COMP_LABEL_CHARS,
  MAX_COMP_NOTE_CHARS,
  MAX_COUNTER_NOTE_CHARS,
  MAX_PROFILE_NOTE_CHARS,
  MAX_TAG_LABEL_CHARS,
  type DraftTagKind,
  type DraftTagRow,
} from "@/lib/draft/types";

// Typed arguments, not FormData: a profile carries two arrays and a tag needs
// its kind alongside its label, and serializing either into a hidden input
// would buy nothing. Same call as tierlists/actions.ts and team/actions.ts.

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
    const tagSlugs = new Set((await loadDraftTags(privateSource(supabase), "function")).map((t) => t.slug));

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
      revalidatePath("/prep/champions");
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

    revalidatePath("/prep/champions");
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

    revalidatePath("/prep/champions");
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

    revalidatePath("/prep/champions");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not rename that tag." };
  }
}

/**
 * Deletes a tag and strips it from everything that carries it — champion
 * profiles for a function tag, saved comps and synergies for a win-condition
 * one. Both, unconditionally: the two vocabularies are separate by convention
 * (`kind`) rather than by constraint, and a slug left dangling in an array
 * renders as a raw slug with no label, which looks like corruption.
 *
 * Both columns are plain array columns, so the cleanup happens in JS rather
 * than via array_remove() in one statement — the query builder has no SQL
 * escape hatch. Both tables are small enough (at most ~170 profiles, and only
 * the rows actually carrying the slug get touched) that a sequential pass is
 * the honest choice, same reasoning as fetchAllByIds' chunking: a page render
 * is a worse place for a burst of parallel writes than for a few extra round
 * trips.
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

    const { data: comps } = await supabase
      .from("draft_comps")
      .select("id, win_conditions")
      .contains("win_conditions", [tag.slug])
      .returns<{ id: string; win_conditions: string[] }[]>();

    for (const row of comps ?? []) {
      await supabase
        .from("draft_comps")
        .update({ win_conditions: row.win_conditions.filter((slug) => slug !== tag.slug) })
        .eq("id", row.id);
    }

    const { data, error } = await supabase.from("draft_tags").delete().eq("id", id).select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "That tag was already removed." };

    revalidatePath("/prep/champions");
    revalidateDraftComps();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not delete that tag." };
  }
}

function revalidateCounters() {
  revalidatePath("/prep/counters");
  revalidatePath("/prep/champions");
}

type ExistingCounterRow = { id: string; counter_champion_id: number; target_champion_id: number };

/**
 * Replaces the full set of matchups on one side of `fixedChampionId` with
 * `rows` in one call — "here is the complete list of who counters Jarvan
 * now," not one pair at a time. Diffed against what's already there: rows
 * that already existed for a champion still in the list are updated in
 * place (preserving created_by — see below), rows for a champion newly added
 * are inserted, and existing rows for a champion no longer in the list are
 * deleted. A single save() from the editor covers add, edit and remove.
 *
 * created_by is only set on insert, never touched on update, for the same
 * reason saveChampionProfile doesn't reassign champion_profiles.updated_by
 * away from who actually wrote a take: the column means "who wrote the
 * original note," not "who last touched this."
 */
export async function saveCounterGroup(input: CounterGroupInput): Promise<DraftActionResult> {
  try {
    const { supabase, user } = await requireSession();

    const championMap = await championsForWrite();
    const problem = validateCounterGroup(input, new Set(championMap.keys()));
    if (problem) return { error: problem };

    const fixedColumn = input.direction === "counteredBy" ? "target_champion_id" : "counter_champion_id";

    const { data: existingRows, error: readError } = await supabase
      .from("champion_counters")
      .select("id, counter_champion_id, target_champion_id")
      .eq(fixedColumn, input.fixedChampionId)
      .returns<ExistingCounterRow[]>();
    if (readError) return { error: readError.message };

    const existingByOther = new Map(
      (existingRows ?? []).map((row) => [
        input.direction === "counteredBy" ? row.counter_champion_id : row.target_champion_id,
        row,
      ]),
    );

    const keptIds = new Set<number>();
    for (const row of input.rows) {
      keptIds.add(row.championId);
      const note = cleanText(row.note, MAX_COUNTER_NOTE_CHARS);
      const existing = existingByOther.get(row.championId);

      const { error } = existing
        ? await supabase
            .from("champion_counters")
            .update({ note, updated_at: new Date().toISOString() })
            .eq("id", existing.id)
        : await supabase.from("champion_counters").insert({
            counter_champion_id: input.direction === "counteredBy" ? row.championId : input.fixedChampionId,
            target_champion_id: input.direction === "counteredBy" ? input.fixedChampionId : row.championId,
            note,
            created_by: user.id,
          });

      if (error) return { error: error.message };
    }

    const toRemove = (existingRows ?? []).filter((row) => {
      const other = input.direction === "counteredBy" ? row.counter_champion_id : row.target_champion_id;
      return !keptIds.has(other);
    });
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("champion_counters")
        .delete()
        .in(
          "id",
          toRemove.map((row) => row.id),
        );
      if (error) return { error: error.message };
    }

    revalidateCounters();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save those matchups." };
  }
}

// Both list routes on every write, because they share a table: saving a
// synergy shouldn't leave the comps page holding a stale count. /prep/draft goes
// too — the contextual panel there reads both kinds.
function revalidateDraftComps() {
  revalidatePath("/prep/comps");
  revalidatePath("/prep/synergies");
  revalidatePath("/prep/draft");
}

export type SaveDraftCompResult = DraftActionResult & { compId?: string };

/**
 * Creates or updates one comp or synergy. `id` absent means insert, present
 * means update in place.
 *
 * Written so the simulator board can call it unchanged in a later phase: it
 * assumes nothing about where the champions came from, and takes the kind in
 * the payload rather than inferring it from the route it was called on. From
 * the board that will be the same call with a label typed into a small dialog
 * and nothing else different.
 *
 * champion_ids goes in exactly as given. The order is the author's — the save
 * dialog lets it be dragged, and for a five-champion comp that means team
 * order, so position doubles as role wherever it's rendered. Sorting it here
 * for tidiness would silently overwrite that choice.
 */
export async function saveDraftComp(
  input: DraftCompInput & { id?: string },
): Promise<SaveDraftCompResult> {
  try {
    const { supabase, user } = await requireSession();

    const championMap = await championsForWrite();
    const winConditionSlugs = new Set(
      (await loadDraftTags(privateSource(supabase), "win_condition")).map((t) => t.slug),
    );

    const problem = validateDraftComp(input, new Set(championMap.keys()), winConditionSlugs);
    if (problem) return { error: problem };

    const fields = {
      kind: input.kind,
      // null when unnamed, never "" — one representation of "no name", and the
      // one draft_comps_label is written against.
      label: cleanText(input.label, MAX_COMP_LABEL_CHARS),
      champion_ids: input.championIds,
      win_conditions: input.winConditions,
      notes: cleanText(input.notes, MAX_COMP_NOTE_CHARS),
    };

    // created_by on insert only, never reassigned on edit — same reasoning as
    // team_series.created_by and champion_counters: it records who wrote the
    // thing, not who last touched it.
    const { data, error } = input.id
      ? await supabase
          .from("draft_comps")
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq("id", input.id)
          .select("id")
      : await supabase
          .from("draft_comps")
          .insert({ ...fields, created_by: user.id })
          .select("id");

    if (error) return { error: error.message };
    // RLS refusals come back as zero rows rather than an error. On an update
    // it can also mean the row is simply gone.
    if (!data || data.length === 0) {
      return {
        error: input.id
          ? "That no longer exists — someone may have deleted it."
          : "That save was blocked. Try signing out and back in.",
      };
    }

    revalidateDraftComps();
    return { compId: (data[0] as { id: string }).id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save that." };
  }
}

export async function deleteDraftComp(id: string): Promise<DraftActionResult> {
  try {
    const { supabase } = await requireSession();

    const { data, error } = await supabase.from("draft_comps").delete().eq("id", id).select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "That was already removed." };

    revalidateDraftComps();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not delete that." };
  }
}
