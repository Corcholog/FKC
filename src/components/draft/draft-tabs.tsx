"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Real routes rather than the Tabs component, same call as team/team-match-tabs.tsx:
// each of these is a server component doing its own query, so they should be
// linkable, refreshable and individually streamable. The tab strip is the only
// part that needs the pathname, so it's the only client component in the section
// shell.

const TABS = [
  { href: "", label: "Simulator" },
  { href: "/champions", label: "Champions" },
  { href: "/comps", label: "Comps" },
  { href: "/synergies", label: "Synergies" },
  { href: "/counters", label: "Counters" },
];

export function DraftTabs({ basePath = "" }: { basePath?: string }) {
  const pathname = usePathname();
  const root = `${basePath}/draft`;

  return (
    // flex-wrap rather than overflow-x-auto. Setting overflow on one axis
    // computes the other from `visible` to `auto`, and the active tab's
    // underline sits at -bottom-px — one pixel of vertical overflow, which
    // was enough to put a scrollbar on a strip of five short links and to
    // clip the underline it came from. Six tabs wrap on a phone; nothing
    // scrolls anywhere else.
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((tab) => {
        const href = `${root}${tab.href}`;
        // Exact for the index (the simulator), prefix for the rest — a URL a
        // tab doesn't own should never light it.
        const active =
          tab.href === "" ? pathname === root : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative shrink-0 px-3 py-2 text-sm font-medium transition-colors",
              active ? "text-gold-bright" : "text-grey-light hover:text-white",
            )}
          >
            {tab.label}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
