"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import type { PlayerProfile } from "@/lib/loaders/player";
import { RankBadge } from "@/components/rank-badge";
import { Badge } from "@/components/ui/badge";
import { platformLabel } from "@/lib/platforms";
import { cn } from "@/lib/utils";

// Which of one person's Riot accounts the page is about.
//
// The schema has supported several accounts each since migration 023 — the
// roster flexes on accounts they don't solo queue on, and one of them solo
// queues on a different server — and until this every number on a player page
// silently folded all of them together, which is right for "how does this
// person play" and wrong for "how is the smurf going".
//
// **A filter, not a page.** It used to be `?account=<puuid>`, on the argument
// that a different set of games is a different query. It isn't one here: the
// page reads every account's rows either way (the counts on these chips are why
// — narrowing the read would leave the filter unable to say what the other
// accounts hold), so each account's fold is already in hand by the time this
// renders. What arrives is one fully-rendered profile per account, and picking
// one is a swap in the tree with no server in it.
//
// The cost is honest and bounded: the payload carries N profiles for somebody
// with N accounts, and the chips only appear at N ≥ 2. One account is not a
// choice, and a filter with one option is furniture.
//
// Two ranks per chip, because League has two ladders and this team plays both.
// `flex_tier` has been written by the sync since 023 and rendered nowhere else.

type Account = PlayerProfile["accounts"][number];

export function AccountFilter({
  accounts,
  totalGames,
  views,
}: {
  accounts: Account[];
  /** Games across every account — what the "All accounts" chip counts. */
  totalGames: number;
  /**
   * One rendered profile per option, in the same order the chips are: index 0
   * is every account together, then one per entry in `accounts`.
   */
  views: React.ReactNode[];
}) {
  const [active, setActive] = useState(0);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-sm font-medium tracking-wide text-grey-light uppercase">Accounts</h2>

        <div className="flex flex-wrap gap-1.5">
          <Chip selected={active === 0} onSelect={() => setActive(0)}>
            <span className="text-sm text-white">All accounts</span>
            <span className="text-xs tabular-nums text-grey-mid">{totalGames}g</span>
          </Chip>

          {accounts.map((account, index) => (
            <Chip
              key={account.puuid}
              selected={active === index + 1}
              onSelect={() => setActive(index + 1)}
            >
              {account.is_primary && (
                <Star className="h-3.5 w-3.5 shrink-0 text-gold" aria-label="Primary account" />
              )}

              <span className="truncate text-sm text-white">
                {account.riot_game_name}
                <span className="text-grey-mid">#{account.riot_tag_line}</span>
              </span>

              <Badge variant="outline" className="shrink-0 text-[10px]">
                {platformLabel(account.platform)}
              </Badge>

              <RankBadge
                tier={account.tier}
                division={account.division}
                leaguePoints={account.league_points}
                size="sm"
              />

              {/* Only when there is one. Most accounts are never ranked in flex,
                  and an "Unranked · flex" chip on every row would make the one
                  that matters harder to find. */}
              {account.flex_tier && (
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-grey-mid">
                  flex
                  <RankBadge
                    tier={account.flex_tier}
                    division={account.flex_division}
                    leaguePoints={account.flex_league_points}
                    size="sm"
                  />
                </span>
              )}

              <span className="shrink-0 text-xs tabular-nums text-grey-mid">{account.games}g</span>
            </Chip>
          ))}
        </div>
      </div>

      {views[active]}
    </>
  );
}

function Chip({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "panel-hex flex min-w-0 items-center gap-2 px-3 py-2 transition-colors",
        selected ? "border-gold-muted bg-bg-tertiary/60" : "hover:bg-bg-tertiary/40",
      )}
    >
      {children}
    </button>
  );
}
