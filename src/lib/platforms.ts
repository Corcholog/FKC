// Which Riot servers the roster actually plays on.
//
// Deliberately shorter than riot.ts's SUPPORTED_PLATFORMS: that list is what the
// client will *route*, this one is what anybody here plays on, and a select with
// thirty regions in it makes picking the right one harder rather than easier.
// Adding a region is one line in both places.
//
// It lives in lib/ rather than beside the `<PlatformSelect>` that renders it,
// because both a client component (the settings form) and a server one (the
// accounts panel on a player page) need the label. A plain function exported
// from a `"use client"` module cannot be called from the server — it is only
// ever a reference to something on the other side of the boundary — and the
// failure is a runtime error on the page, not a build one.
//
// Pure: no I/O, no React.

export const PLATFORMS: { value: string; label: string }[] = [
  { value: "LA2", label: "LAS" },
  { value: "LA1", label: "LAN" },
  { value: "BR1", label: "BR" },
  { value: "NA1", label: "NA" },
];

/** Falls back to the raw platform code, so an unlisted server still renders. */
export function platformLabel(platform: string): string {
  return PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
}
