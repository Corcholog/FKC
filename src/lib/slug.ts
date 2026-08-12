export function playerSlug(gameName: string, tagLine: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${norm(gameName)}-${norm(tagLine)}`;
}

// The combining-marks block that NFD splits accents out into. Built from a
// string rather than written as a regex literal so the source stays ASCII —
// the characters themselves are invisible in an editor.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * A diacritic-folding slug for free text typed by hand — real names, not
 * identifiers a developer chose. Without the NFD pass "Universidad de Córdoba"
 * slugs to "universidad-de-c-rdoba", since the accented character isn't in
 * [a-z0-9] and becomes a separator.
 *
 * Returns "" for input with nothing sluggable in it — the caller decides what
 * to do about that rather than getting a silently empty slug.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slug for a scrim opponent's /scrims/opponents/[slug] page. */
export function opponentSlug(name: string): string {
  return slugify(name);
}
