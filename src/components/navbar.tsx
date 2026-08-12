"use client";

import { useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Swords,
  Trophy,
  LineChart,
  ListOrdered,
  Shield,
  Network,
  Settings,
  Menu,
  Loader2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { MatchupSearch } from "@/components/matchup-search";
import type { ChampionInfo } from "@/lib/ddragon";
import type { LolalyticsLane } from "@/lib/lolalytics";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Browsing destinations only. Settings is deliberately not here: it's the admin
// page, not somewhere you go to look at something, and it already sits visually
// with /account on the right. Keeping it out is what left room for Scrims
// without making this row tighter than it already is.
//
// Draft is the eighth slot. Seven links plus the matchup search, Sync, the
// settings gear, the account link and Sign out were already tight at 1024px —
// adding an eighth without more room would have been the row's actual breaking
// point, not just a squeeze — so the collapse below moved from lg to xl at the
// same time. Below xl, all eight links live in the sheet, same as before.
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/team", label: "Team", icon: Users },
  { href: "/matches", label: "Matches", icon: Swords },
  { href: "/champions", label: "Champions", icon: Trophy },
  { href: "/tierlists", label: "Tier Lists", icon: ListOrdered },
  { href: "/insights", label: "Insights", icon: LineChart },
  { href: "/scrims", label: "Scrims", icon: Shield },
  { href: "/draft", label: "Draft", icon: Network },
];

/**
 * Whether a nav item owns the current page.
 *
 * Prefix-matching, not equality: /scrims has four tabs under it, and an exact
 * match would leave the navbar highlighting nothing the moment you opened one.
 * The same bug applied to /player/[slug] and /tierlists/[slug] before this.
 *
 * "/" is special-cased because every path starts with it.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Crest() {
  // Placeholder crest — swap for the real Fake Clan PNG (e.g. next/image
  // src="/fake-clan-logo.png") once provided; layout doesn't need to change.
  return (
    <div className="hex-clip flex h-8 w-8 shrink-0 items-center justify-center bg-gradient-to-br from-gold-muted via-gold-muted to-gold font-heading text-xs font-bold text-gold-bright">
      FC
    </div>
  );
}

function NavLink({
  href,
  label,
  Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "text-gold-bright" : "text-grey-light hover:text-white",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {active && (
        <span className="absolute inset-x-2 -bottom-[9px] hidden h-0.5 rounded-full bg-gold sm:block" />
      )}
    </Link>
  );
}

export function Navbar({
  initialSyncing = false,
  accountLabel,
  champions,
  ddragonVersion,
  mainLane,
}: {
  initialSyncing?: boolean;
  /** Who's signed in — the linked player's display name, or their email. */
  accountLabel?: string | null;
  /** Current-patch champion list for the Lolalytics matchup lookup. */
  champions: ChampionInfo[];
  ddragonVersion: string;
  /** Prefills the matchup lookup's lane with the signed-in player's main role. */
  mainLane: LolalyticsLane;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(initialSyncing);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Sync failed.");
      } else {
        const result = `Synced: ${data.newMatches} new match(es), ${data.playersProcessed} player(s).`;
        // A partial run isn't a failure — Riot's rate limit ran the sync out of
        // time, and the next one resumes from the same point. Say so, though,
        // or a backfill looks stuck.
        if (data.partial) {
          toast.warning(`${result} Hit the rate limit — sync again to continue.`);
        } else {
          toast.success(result);
        }
      }
      router.refresh();
    } catch {
      toast.error("Sync failed — network error.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-navy/95 backdrop-blur supports-backdrop-filter:bg-navy/80">
      <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Crest />
            <span className="font-heading hidden text-base font-semibold tracking-wide text-white sm:inline">
              Fake Clan
            </span>
          </Link>

          {/* The matchup fields need room, so the links collapse into the sheet
              one breakpoint later than they used to. */}
          <nav className="hidden items-center gap-1 xl:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                Icon={item.icon}
                active={isActive(pathname, item.href)}
              />
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <MatchupSearch
            champions={champions}
            version={ddragonVersion}
            defaultLane={mainLane}
            className="hidden xl:flex"
          />

          <Button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            size="sm"
            className="hidden sm:inline-flex"
          >
            {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {syncing ? "Syncing…" : "Sync"}
          </Button>
          <Button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            size="icon-sm"
            className="sm:hidden"
            aria-label="Sync"
          >
            <Loader2 className={cn("h-4 w-4", syncing ? "animate-spin" : "hidden")} />
            {!syncing && <Swords className="h-4 w-4" />}
          </Button>

          {/* Settings lives here rather than in NAV_ITEMS — see the comment on
              that array. Icon-only: it's the one destination nobody needs a
              label to find, and the row has no width to spare. */}
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className={cn(
              "hidden h-8 w-8 items-center justify-center rounded-md transition-colors sm:inline-flex",
              isActive(pathname, "/settings")
                ? "text-gold-bright"
                : "text-grey-light hover:text-white",
            )}
          >
            <Settings className="h-4 w-4" />
          </Link>

          {accountLabel && (
            <Link
              href="/account"
              className={cn(
                "hidden max-w-40 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-sm transition-colors sm:inline-flex",
                isActive(pathname, "/account")
                  ? "text-gold-bright"
                  : "text-grey-light hover:text-white",
              )}
            >
              <UserRound className="h-4 w-4 shrink-0" />
              <span className="truncate">{accountLabel}</span>
            </Link>
          )}

          <Button type="button" variant="ghost" size="sm" onClick={handleSignOut} className="hidden sm:inline-flex">
            Sign out
          </Button>

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Open menu" />}
              className="xl:hidden"
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            {/* Focus the panel itself, not its first field: the matchup search
                sits at the top, and autofocusing it pops the champion list open
                the moment the menu does. */}
            <SheetContent
              ref={sheetRef}
              initialFocus={sheetRef}
              side="left"
              className="bg-bg-secondary"
            >
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Crest />
                  Fake Clan
                </SheetTitle>
              </SheetHeader>
              <MatchupSearch
                champions={champions}
                version={ddragonVersion}
                defaultLane={mainLane}
                stacked
                className="px-4"
                onOpened={() => setSheetOpen(false)}
              />
              <nav className="flex flex-col gap-1 px-2">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    Icon={item.icon}
                    active={isActive(pathname, item.href)}
                    onNavigate={() => setSheetOpen(false)}
                  />
                ))}
              </nav>
              {/* sm:hidden, same as it already was: from sm up these three are
                  in the header, and the gear there covers Settings too. Below
                  sm the header hides them all, so this block is the only way
                  to reach any of them. */}
              <div className="mt-auto flex flex-col gap-2 border-t border-border p-4 sm:hidden">
                <NavLink
                  href="/settings"
                  label="Settings"
                  Icon={Settings}
                  active={isActive(pathname, "/settings")}
                  onNavigate={() => setSheetOpen(false)}
                />
                {accountLabel && (
                  <NavLink
                    href="/account"
                    label={accountLabel}
                    Icon={UserRound}
                    active={isActive(pathname, "/account")}
                    onNavigate={() => setSheetOpen(false)}
                  />
                )}
                <Button type="button" variant="ghost" size="sm" onClick={handleSignOut}>
                  Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
