import { TIER_LABEL_TEXT, type Tier, type TierChampion, type TierChampionStat } from "@/lib/tierlist";
import { ChampionTileWithStats } from "@/components/tierlist/champion-tile";
import { ROW_MIN_HEIGHT_CLASS } from "@/components/tierlist/layout-constants";
import { cn } from "@/lib/utils";

/**
 * Read-only render of a tier list.
 *
 * Deliberately the same component the overview page and the PNG export both
 * use, so a downloaded image is exactly what was on screen rather than a second
 * layout that drifts. The editor renders its own rows (they need drop targets),
 * but matches these classes.
 */
export function TierListView({
  tiers,
  champions,
  version,
  stats,
  exportTitle,
  exportSubtitle,
  /** Drops the responsive label width — see TierListExportNode for why. */
  fixedLayout = false,
}: {
  tiers: Tier[];
  champions: Map<number, TierChampion>;
  version: string;
  stats?: Map<number, TierChampionStat>;
  /** Only rendered inside the PNG, so a downloaded file identifies itself. */
  exportTitle?: string;
  exportSubtitle?: string;
  fixedLayout?: boolean;
}) {
  return (
    <div className="panel-hex overflow-hidden">
      {exportTitle && (
        <div className="border-b border-border bg-bg-secondary px-3 py-2">
          <p className="font-heading text-sm font-semibold tracking-wide text-gold-bright uppercase">
            {exportTitle}
          </p>
          {exportSubtitle && <p className="text-xs text-grey-mid">{exportSubtitle}</p>}
        </div>
      )}

      {tiers.length === 0 ? (
        <p className="bg-bg-secondary p-4 text-sm text-grey-mid">This tier list has no tiers.</p>
      ) : (
        tiers.map((tier) => (
          <div key={tier.id} className="flex items-stretch border-b border-border last:border-b-0">
            <div
              style={{ backgroundColor: tier.color, color: TIER_LABEL_TEXT }}
              className={cn(
                "flex shrink-0 items-center justify-center overflow-hidden p-1 text-center font-heading text-lg leading-tight font-bold break-words uppercase",
                fixedLayout ? "w-24" : "w-14 sm:w-24",
              )}
            >
              {tier.label}
            </div>
            <div
              className={cn(
                "flex flex-1 flex-wrap content-start gap-1 bg-bg-secondary p-1.5",
                ROW_MIN_HEIGHT_CLASS,
              )}
            >
              {tier.championIds.map((championId) => {
                const champion = champions.get(championId);
                if (!champion) return null;
                return (
                  <ChampionTileWithStats
                    key={championId}
                    champion={champion}
                    version={version}
                    stat={stats?.get(championId)}
                  />
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
