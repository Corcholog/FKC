import { Crown, Shield } from "lucide-react";
import { formatRank, isApexTier, rankTierColor } from "@/lib/rank";

// Styled badge, not a sourced emblem image — DDragon doesn't officially host
// rank emblems and unofficial mirrors were already ruled out as unreliable
// in docs/05_DESIGN_SYSTEM.md. Icon + gradient tint carries the "premium"
// feel instead.
export function RankBadge({
  tier,
  division,
  leaguePoints,
  size = "md",
}: {
  tier: string | null;
  division: string | null;
  leaguePoints?: number | null;
  size?: "sm" | "md" | "lg";
}) {
  const color = rankTierColor(tier);
  const Icon = isApexTier(tier) ? Crown : Shield;

  const sizeClasses = {
    sm: "gap-1 px-2 py-0.5 text-[10px]",
    md: "gap-1.5 px-2.5 py-1 text-xs",
    lg: "gap-2 px-3 py-1.5 text-sm",
  }[size];
  const iconClasses = { sm: "h-3 w-3", md: "h-3.5 w-3.5", lg: "h-4 w-4" }[size];

  return (
    <div
      className={`inline-flex items-center rounded-full border font-medium ${sizeClasses}`}
      style={{
        borderColor: `color-mix(in oklch, ${color} 60%, transparent)`,
        color,
        background: `linear-gradient(135deg, color-mix(in oklch, ${color} 18%, transparent), transparent)`,
      }}
    >
      <Icon className={iconClasses} />
      <span>{formatRank(tier, division)}</span>
      {tier && leaguePoints != null && (
        <span className="text-grey-light font-normal tabular-nums">{leaguePoints} LP</span>
      )}
    </div>
  );
}
