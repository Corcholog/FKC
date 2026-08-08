import { championDisplayName, championIconUrl, type ChampionInfo } from "@/lib/ddragon";
import { cn } from "@/lib/utils";

// Server component: no interactivity, so the champion map never crosses into
// the RSC payload — which matters when a page renders a couple of hundred of
// these.
//
// `championName` is the stored fallback (Riot's codename, "MonkeyKing"), only
// used if the champion vanished from the current patch's DDragon data. Bans are
// stored as bare ids, so they pass the id as their own fallback.

const SIZES = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
} as const;

export function ChampionIcon({
  championId,
  championName,
  version,
  championMap,
  size = "md",
  dimmed = false,
  banned = false,
  className,
}: {
  championId: number;
  championName?: string;
  version: string;
  championMap: Map<number, ChampionInfo>;
  size?: keyof typeof SIZES;
  /** Greys it out — champions unavailable in a fearless series. */
  dimmed?: boolean;
  /**
   * Greys it out *and* strikes it through. Dimming alone reads as "loading" or
   * "disabled"; a ban needs to read as a ban at icon size, where there's no room
   * for a label.
   */
  banned?: boolean;
  className?: string;
}) {
  const fallback = championName ?? String(championId);
  const url = championIconUrl(championId, version, championMap);
  const name = championDisplayName(championId, championMap, fallback);
  const muted = dimmed || banned;

  const inner = url ? (
    // eslint-disable-next-line @next/next/no-img-element -- tiny icon, next/image overhead isn't worth it here
    <img
      src={url}
      alt={name}
      loading="lazy"
      className={cn(
        "h-full w-full rounded-sm object-cover",
        banned ? "opacity-55 grayscale" : dimmed ? "opacity-40 grayscale" : "",
      )}
    />
  ) : (
    <span
      className={cn(
        "flex h-full w-full items-center justify-center rounded-sm bg-bg-tertiary text-[9px] text-grey-mid",
        muted && "opacity-60",
      )}
    >
      {name.slice(0, 2)}
    </span>
  );

  return (
    <span
      title={banned ? `${name} — banned` : name}
      // overflow-hidden clips the slash to the icon box, so the rotated line
      // reads as a strike across the portrait rather than a stray diagonal.
      className={cn("relative block shrink-0 overflow-hidden rounded-sm", SIZES[size], className)}
    >
      {inner}
      {banned && (
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-px w-[160%] -rotate-45 bg-loss/80" />
        </span>
      )}
    </span>
  );
}
