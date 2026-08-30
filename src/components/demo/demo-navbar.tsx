"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LineChart,
  ListOrdered,
  Network,
  Shield,
  Swords,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";

// The public demo's own chrome, deliberately not the app's Navbar.
//
// That component carries a Sync button that POSTs to /api/sync, a Settings gear,
// an account link and a sign-out — every one of which is either a mutation or a
// route a signed-out visitor can't reach. It also renders `accountLabel`, which
// falls back to the signed-in user's raw email address. Reusing it and hiding
// five things with props would mean the public header is one forgotten
// conditional away from exposing something; a separate component has nothing to
// forget.
//
// /demo/player/[alias] is deliberately absent: it's reached by clicking a card,
// and a nav entry would need a player to point at. Icons match the private
// navbar's, so the two versions are recognisably the same tool.
const NAV_ITEMS = [
  { href: "/demo", label: "Dashboard", icon: LayoutDashboard },
  { href: "/demo/team", label: "Team", icon: Shield },
  { href: "/demo/matches", label: "Matches", icon: Swords },
  { href: "/demo/champions", label: "Champions", icon: Trophy },
  { href: "/demo/tierlists", label: "Tier Lists", icon: ListOrdered },
  { href: "/demo/insights", label: "Insights", icon: LineChart },
  { href: "/demo/draft", label: "Draft", icon: Network },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/demo") return pathname === "/demo";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DemoNavbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg-secondary/95 backdrop-blur">
      {/* Full-bleed, like the private navbar, rather than capped at the pages'
          max-w-4xl. Eight labelled links simply do not fit in 896px, and the
          first version of this header capped the row and then reached for
          `overflow-x-auto` to cope — which put a scrollbar across a sticky
          header at every width above a phone. Setting overflow on one axis also
          computes the other from `visible` to `auto`, the same trap TeamMatchTabs
          documents; there is nothing to scroll here now.

          `flex-wrap` is the safety net that replaces it: if a translation or a
          new link ever outgrows the row, the header gets taller instead of
          growing a scrollbar or clipping a link. */}
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/demo" className="flex shrink-0 items-center gap-2">
          <div className="hex-clip flex h-8 w-8 shrink-0 items-center justify-center bg-gradient-to-br from-gold-muted via-gold-muted to-gold font-heading text-xs font-bold text-gold-bright">
            FC
          </div>
          <span className="font-heading text-sm font-semibold text-white">SoloQ Tracker</span>
        </Link>

        {/* On a phone the links take a row of their own — `order-last w-full`
            — instead of competing with the wordmark for 375px. From `sm` they
            sit inline as icons, and the labels appear at `xl`, the same
            breakpoint the private navbar collapses at.

            No sheet: that is state, a portal and a focus trap, and this header
            has eight read-only links and no menu to hide. */}
        <nav className="order-last flex w-full flex-wrap items-center gap-1 sm:order-none sm:w-auto sm:flex-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "text-gold-bright" : "text-grey-light hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {/* Hidden visually, never removed: an icon-only link with no
                    accessible name is a link a screen reader announces as its
                    URL. */}
                <span className="sr-only xl:not-sr-only">{label}</span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/login"
          className="ml-auto shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-grey-light transition-colors hover:text-white"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}
