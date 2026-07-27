# Design System — Fake Clan SoloQ Tracker

A dark, blue-toned palette per your brief. All values below are meant to become CSS custom properties (or a Tailwind theme extension) so the whole app can be retinted from one place if you want to nudge any of them later.

## 1. Color Palette

```css
:root {
  /* backgrounds, darkest to lightest */
  --color-bg-primary: #0A0E17;     /* page background, near-black */
  --color-bg-secondary: #121A2B;   /* cards, panels — dark navy */
  --color-bg-tertiary: #1B263F;    /* nested cards, hover surfaces */

  /* structure */
  --color-navy: #1E2E52;           /* navbar, section headers */
  --color-border: #2A3654;        /* dividers, card borders */

  /* accent (interactive) */
  --color-blue-primary: #3B82F6;  /* buttons, links, active states */
  --color-blue-bright: #5FA1FF;   /* hover state for the above */
  --color-blue-muted: #2C4677;    /* secondary buttons, badges */

  /* text */
  --color-white: #F1F4F9;         /* primary text */
  --color-grey-light: #9AA6BD;    /* secondary text, labels */
  --color-grey-mid: #5C6786;      /* disabled/muted text, placeholders */
  --color-black: #05070C;         /* deepest shadows/accents only */

  /* win/loss (see note below) */
  --color-win: #5FA1FF;           /* lighter blue = win */
  --color-loss: #5C6786;          /* muted grey = loss */
}
```

**Note on win/loss coloring:** your brief specified a strict blue/navy/grey/white/black palette, so W/L badges above use a lighter-blue-vs-grey distinction rather than the more conventional green/red. This works, but it's a genuinely close call — green/red is instantly scannable in a way that blue/grey needs a beat longer to read, especially at a glance across a whole roster of W/L records. If you find yourself squinting at the home page once it's built, adding `--color-win-alt: #22C55E` and `--color-loss-alt: #EF4444` as a single opt-in accent pair (used *only* for the W/L badge, nowhere else) is a one-line change, not a redesign.

## 2. Typography

- A clean system/sans stack is enough for this project — no need to load a custom font just for an internal tool. `font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;` (or swap in Inter via next/font if you want something slightly more distinct — either is fine).
- Numbers (LP, KDA, damage/gold/CS figures) benefit from a tabular/monospace numeral variant so columns align cleanly in tables — `font-variant-numeric: tabular-nums;` is a nice, cheap touch on any stat table.

## 3. Component Notes

- **Player card (home page):** avatar photo, display name, rank badge (tier + division as a `--color-blue-muted` pill, LP as smaller text beside it), W/L as bold text using the win/loss colors above, winrate % underneath. Whole card is a link to the player detail page.
- **Match row (match history list):** small champion icon (from DDragon, per `04_RIOT_API_INTEGRATION.md`) on the left, W/L as a colored vertical bar or badge, then KDA / damage / gold / CS / duration as a compact stat row, relative timestamp on the right ("2 hours ago"). Clicking expands or navigates to the full 10-player breakdown.
- **Match detail (10-player breakdown):** two columns (ally team / enemy team), each row = champion icon + name + KDA + damage + gold + CS. Use `--color-blue-muted` background tint for the ally column and `--color-bg-tertiary` for the enemy column to make the split legible without needing extra color.
- **Notes:** simple stacked list under each match, each note showing its (optional) author name and timestamp, with add/edit/delete inline — no need for a separate notes page.
- **AI summary block:** treat it visually as a distinct "card" (e.g. `--color-bg-tertiary` background, maybe a subtle left border in `--color-blue-primary`) so it reads as "generated content" rather than blending into the raw stats around it. Show the `generated_at` timestamp small and muted underneath.
- **Navbar:** `--color-navy` background, Fake Clan icon on the left, manual sync button and (when relevant) the expired-key warning icon/badge on the right. The expired-key state is worth making genuinely attention-grabbing (not just another muted grey icon) since it's the one thing in this app that silently breaks data collection if missed.

## 4. Assets You Already Have

- Fake Clan icon/logo — use in the navbar and as a favicon/app icon.
- Player photos — used as avatars on the home page cards and player detail headers. Store these in Supabase Storage (free tier includes 1GB) rather than committing them to the repo, and reference by URL from the `players.avatar_url` column.
