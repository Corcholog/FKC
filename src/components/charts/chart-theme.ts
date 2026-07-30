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

// Categorical series colours, assigned in this fixed order and never cycled.
// Validated against the #10151d chart surface for the OKLCH lightness band,
// chroma floor, protan/deutan separation, normal-vision separation, and
// contrast — do not substitute values by eye, and re-run the check if you do:
//   node scripts/validate_palette.js "<hexes>" --mode dark --surface "#10151d"
export const SERIES_COLORS = [
  "#af7c00",
  "#5e6bd4",
  "#4ea954",
  "#9e4aa4",
  "#00a5b5",
  "#b33736",
];

// Beyond this the palette would have to be cycled, which makes two players the
// same colour. Charts cap their series here and say so instead.
export const MAX_SERIES = SERIES_COLORS.length;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export const AXIS_TICK = { fill: CHART_INK.axis, fontSize: 11 };
export const GRID_STROKE = CHART_INK.grid;
