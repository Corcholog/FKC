import type { Tier, TierChampion } from "@/lib/tierlist";
import {
  LABEL_WIDTH_PX,
  ROW_GAP_PX,
  ROW_PADDING_PX,
  TILE_PX,
} from "@/components/tierlist/layout-constants";
import { TierListView } from "@/components/tierlist/tier-list-view";

// The image is as wide as the fullest row, so the tier with the most champions
// fills its line edge to edge and nothing is padded out with dead space.
//
// Clamped at both ends, because "as wide as the fullest row" is only sensible
// in the middle: a list with two champions in it would otherwise export as a
// stamp, and one with sixty in S would come out five thousand pixels wide and
// unopenable. Past the ceiling the row wraps, which costs no empty space
// either — a wrapped row is full by definition.
const MIN_COLUMNS = 8;
const MAX_COLUMNS = 20;

// A pixel short and the fullest row wraps, leaving exactly the gap this is
// meant to remove. The panel's own 1px border each side plus a little slack.
const BORDER_SLACK_PX = 4;

export function exportWidth(tiers: Tier[]): number {
  const fullest = tiers.reduce((max, tier) => Math.max(max, tier.championIds.length), 0);
  const columns = Math.min(Math.max(fullest, MIN_COLUMNS), MAX_COLUMNS);
  return (
    LABEL_WIDTH_PX +
    ROW_PADDING_PX * 2 +
    columns * TILE_PX +
    (columns - 1) * ROW_GAP_PX +
    BORDER_SLACK_PX
  );
}

/**
 * The thing DownloadPngButton captures.
 *
 * Rendered off-screen rather than pointed at the visible board for three
 * reasons: it carries a title header that would be a duplicate heading on the
 * page, it's sized to its contents instead of to the browser window, and
 * `fixedLayout` keeps it clear of responsive classes — `sm:` variants inside an
 * off-screen node still resolve against the viewport, so without it the same
 * list would export differently from a phone than from a desktop. The icons are
 * the same URLs the visible board uses, so this costs no extra requests.
 */
export function TierListExportNode({
  id,
  title,
  subtitle,
  tiers,
  champions,
  version,
}: {
  id: string;
  title: string;
  subtitle?: string;
  tiers: Tier[];
  champions: Map<number, TierChampion>;
  version: string;
}) {
  return (
    <div
      aria-hidden
      style={{ width: exportWidth(tiers) }}
      className="pointer-events-none fixed top-0 -left-[10000px]"
    >
      <div id={id}>
        <TierListView
          tiers={tiers}
          champions={champions}
          version={version}
          exportTitle={title}
          exportSubtitle={subtitle}
          fixedLayout
        />
      </div>
    </div>
  );
}
