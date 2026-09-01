import Link from "next/link";
import { formatKdaRatio } from "@/lib/format";
import { formatRole } from "@/lib/roles";
import { formatRank, rankTierColor } from "@/lib/rank";
import { avatarTint } from "@/lib/avatar-tint";
import { championDisplayName, championIconUrl, type ChampionInfo } from "@/lib/ddragon";
import type { RosterCard as Card } from "@/lib/loaders/roster-board";
import { winRateTone } from "@/components/team/ui";
import { cn } from "@/lib/utils";

// One player, as a portrait card — the shape the sibling FKC tracker's roster
// used, which is the thing that made its home page read as a team rather than as
// a table with faces in it.
//
// A server component: nothing here is interactive beyond the link, and the
// board around it is the only part that needs client state.

/**
 * How tall the portrait is, as a ratio.
 *
 * 3:4 rather than the sibling app's fixed 300px. That app ships five known JPEGs
 * from /public and can hard-code a height they all suit; these come from
 * `players.avatar_url`, which is whatever was uploaded — square avatars
 * included. A ratio plus object-cover crops any of them to the same shape
 * instead of letterboxing some and stretching others, and `object-top` is what
 * makes the crop keep the face when the source is taller than it is wide.
 */
const PORTRAIT = "aspect-3/4";

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 text-center">
      <p className="label-micro text-grey-mid">{label}</p>
      <p className={cn("font-heading tabular-nums text-lg font-semibold", tone ?? "text-white")}>
        {value}
      </p>
    </div>
  );
}

export function RosterCard({
  card,
  version,
  championMap,
  /**
   * Whether this source can produce an MVP at all.
   *
   * SoloQ cannot — the comparison is between our players, and a soloQ game holds
   * one. Rather than printing a truthful but meaningless 0–0 on every card, the
   * pair is hidden, so an empty space means "not a question this source answers"
   * and a zero means "asked, and the answer is none".
   */
  showAwards,
}: {
  card: Card;
  version: string;
  championMap: Map<number, ChampionInfo>;
  showAwards: boolean;
}) {
  const tierColor = rankTierColor(card.tier);
  const rank = formatRank(card.tier, card.division);

  return (
    <Link
      href={`/players/${card.slug}`}
      className="panel-hex group flex min-w-0 flex-col overflow-hidden"
      // The card is bordered in the player's own tier colour, which is the one
      // piece of the sibling app's roster that carried real information rather
      // than decoration: five cards side by side become a rank ladder you read
      // without looking at a single number.
      style={card.tier ? { borderColor: `color-mix(in oklch, ${tierColor} 45%, transparent)` } : undefined}
    >
      <div className={cn("relative w-full shrink-0 overflow-hidden bg-bg-tertiary", PORTRAIT)}>
        {card.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- one per player, already sized by the layout; next/image's loader adds a round trip per card for no benefit at this size
          <img
            src={card.avatarUrl}
            alt=""
            className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-heading text-4xl font-bold"
            style={avatarTint(card.displayName)}
          >
            {card.displayName.slice(0, 2).toUpperCase()}
          </div>
        )}

        {/* The name sits on the portrait rather than under it, over a gradient
            that darkens only the bottom third — the portraits are arbitrary
            uploads and some of them are pale down there. */}
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/60 to-transparent p-2.5 pt-8">
          <p className="label-micro truncate text-gold">{formatRole(card.teamRole)}</p>
          <p className="truncate font-heading text-xl font-bold tracking-wide text-white uppercase transition-colors group-hover:text-gold-bright">
            {card.displayName}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-2.5">
        <div className="text-center">
          <p className="label-micro text-grey-mid">Peak soloQ rank</p>
          <p
            className="font-heading text-sm font-bold tracking-wide uppercase"
            style={{ color: card.tier ? tierColor : undefined }}
          >
            {card.tier ? rank : "Unranked"}
          </p>
          {card.leaguePoints !== null && card.tier && (
            <p className="tabular-nums text-[11px] text-grey-light">{card.leaguePoints} LP</p>
          )}
        </div>

        {card.games === 0 ? (
          <p className="border-y border-border py-2 text-center text-[11px] text-grey-mid">
            No games in this source
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1 border-y border-border py-2">
            <Stat label="WR" value={`${card.winRate}%`} tone={winRateTone(card.winRate)} />
            <Stat label="KDA" value={card.kda === null ? "—" : formatKdaRatio(card.kda)} />
            {/* Dashes rather than a zero when nothing is scored: a scrim records
                none of what the score reads, and an unscored history is not a
                bad one. */}
            <Stat
              label="Score"
              value={card.avgScore === null ? "—" : card.avgScore.toFixed(0)}
            />
          </div>
        )}

        {showAwards && (
          <div className="grid grid-cols-2 gap-1.5">
            <div className="border border-win/30 bg-win/10 py-1 text-center">
              <p className="label-micro text-win/80">MVP</p>
              <p className="font-heading tabular-nums text-base font-semibold text-win">
                {card.mvps}
              </p>
            </div>
            <div className="border border-loss/30 bg-loss/10 py-1 text-center">
              <p className="label-micro text-loss/80">INT</p>
              <p className="font-heading tabular-nums text-base font-semibold text-loss">
                {card.ints}
              </p>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="label-micro text-grey-mid">Top picks</p>
          {card.champions.length === 0 ? (
            <p className="text-[11px] text-grey-mid">Nothing recorded</p>
          ) : (
            card.champions.map((champion) => {
              const icon = championIconUrl(champion.championId, version, championMap);
              const name = championDisplayName(
                champion.championId,
                championMap,
                champion.championName,
              );
              return (
                <div
                  key={champion.championId}
                  className="flex min-w-0 items-center gap-1.5 bg-bg-tertiary/60 p-1"
                >
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element -- tiny decorative icons, next/image overhead isn't worth it here
                    <img src={icon} alt="" className="h-6 w-6 shrink-0" loading="lazy" />
                  ) : (
                    <div className="h-6 w-6 shrink-0 bg-gold-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[11px] text-white">{name}</span>
                  <span className="shrink-0 tabular-nums text-[10px] text-grey-mid">
                    {champion.games}g
                  </span>
                  <span
                    className={cn(
                      "w-8 shrink-0 text-right tabular-nums text-[10px] font-semibold",
                      winRateTone(champion.winRate),
                    )}
                  >
                    {champion.winRate}%
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Link>
  );
}
