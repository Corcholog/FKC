// Shared visual constants for every chart in the app.
//
// Literal hexes rather than var(--color-*): Recharts writes colours into SVG
// presentation attributes, where custom-property support is inconsistent enough
// not to bet a whole chart on. These mirror src/app/globals.css — the app ships
// a single permanent dark theme, so there is no light variant to keep in sync.

export const CHART_INK = {
  surface: "#10151d", // --color-bg-secondary, the card the charts sit on
  grid: "#232a36",
  axis: "#8a887f", // --color-grey-mid
  label: "#a8a296", // --color-grey-light
  primary: "#c89b3c", // --color-gold
  primaryBright: "#e8c87a", // --color-gold-bright
  win: "#3fbf6f",
  loss: "#e2504a",
};

export const AXIS_TICK = { fill: CHART_INK.axis, fontSize: 11 };
export const GRID_STROKE = CHART_INK.grid;
