// Board geometry in pixels, shared by the rows that render it and the export
// width maths that has to predict it.
//
// A plain module with no "use client" on purpose. These were originally
// exported from champion-tile.tsx, which is a Client Component — so reading
// TILE_PX from a Server Component handed back a client *reference* rather than
// the number (typeof "function"), and `columns * TILE_PX` came out NaN. Values
// crossing the server/client line have to live somewhere neutral like this.
//
// Each constant mirrors a Tailwind class; change one and change the other:
export const TILE_PX = 56; // h-14 w-14 on the champion icon
export const ROW_PADDING_PX = 6; // p-1.5 on the row body
export const ROW_GAP_PX = 4; // gap-1 between icons
export const LABEL_WIDTH_PX = 96; // w-24 on the tier label cell

// A row is one icon tall plus its padding, so a full row and an empty one line
// up. Tailwind's min-h-17 (4.25rem = 68px).
export const ROW_MIN_HEIGHT_CLASS = "min-h-17";
