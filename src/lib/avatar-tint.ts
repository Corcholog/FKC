// A stable colour per person, for when there is no photo to show.
//
// The avatar fallback renders initials on `bg-muted`, which is the same grey for
// everyone. That was fine while it was the exception — most of the roster has an
// uploaded photo. On /demo it is the rule: every player is anonymized, so every
// avatar is a fallback, and five identical grey circles make the roster grid
// unreadable at a glance.
//
// Hue comes from the name, so it is deterministic across renders and across
// machines — no state, no palette table to keep in sync. Saturation and
// lightness are fixed rather than derived: letting the hash pick them too is how
// you end up with one player who is invisible against the card and another who
// glows. Held in oklch for even perceived lightness across the hue circle, which
// is the whole reason the app's tokens are oklch as well.

const SATURATION = 0.08; // muted enough to sit behind white text without competing
const LIGHTNESS = 0.42; // dark enough that the foreground below always passes contrast

/** Deterministic 32-bit hash. FNV-1a — small, no dependencies, well spread. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Inline style for an avatar fallback, keyed off whatever name is being shown.
 *
 * Inline rather than a Tailwind class because the hue is computed per row —
 * a class would mean pre-declaring every bucket, and Tailwind's JIT can't see
 * a template-literal class name anyway.
 */
export function avatarTint(seed: string): React.CSSProperties {
  const hue = hash(seed) % 360;
  return {
    backgroundColor: `oklch(${LIGHTNESS} ${SATURATION} ${hue})`,
    color: `oklch(0.96 0.02 ${hue})`,
  };
}
