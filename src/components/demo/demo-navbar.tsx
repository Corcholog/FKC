"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Trophy } from "lucide-react";
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
// and a nav entry would need a player to point at. /demo/matches and
// /demo/insights land next; /demo/scrims and /demo/draft with phase 4.
const NAV_ITEMS = [
  { href: "/demo", label: "Roster", icon: LayoutDashboard },
  { href: "/demo/champions", label: "Champions", icon: Trophy },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/demo") return pathname === "/demo";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DemoNavbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg-secondary/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/demo" className="flex shrink-0 items-center gap-2">
          <div className="hex-clip flex h-8 w-8 shrink-0 items-center justify-center bg-gradient-to-br from-gold-muted via-gold-muted to-gold font-heading text-xs font-bold text-gold-bright">
            FC
          </div>
          <span className="font-heading text-sm font-semibold text-white">SoloQ Tracker</span>
        </Link>

        {/* Scrolls rather than collapsing into a sheet: the demo has a handful
            of links and a sheet is state, a portal and a focus trap for a
            problem this header doesn't have yet. */}
        <nav className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "text-gold-bright" : "text-grey-light hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/login"
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-grey-light transition-colors hover:text-white"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}
