"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Real routes rather than the Tabs component: each of these is a server
// component doing its own query, so they should be linkable, refreshable and
// individually streamable. The tab strip is the only part that needs the
// pathname, so it's the only client component in the section shell.
//
// This is the merge of what used to be two strips — /prep/draft's five tabs and
// /team's opponent-facing three — plus tier lists. They were separate while the
// app was two trackers; they are one subject now, which is "everything you look
// at before a game rather than after it".
//
// The order is the two halves in that reading: champion knowledge first (what
// exists, what beats what, what we like), then our own record against it (what
// we drafted, who we played, what they do). "Picks & bans" rather than "Drafts",
// which sat one tab away from "Draft" and read as the same page twice.
const TABS = [
  { href: "/draft", label: "Draft" },
  { href: "/champions", label: "Champions" },
  { href: "/comps", label: "Comps" },
  { href: "/synergies", label: "Synergies" },
  { href: "/counters", label: "Counters" },
  { href: "/tierlists", label: "Tier lists" },
  { href: "/scouting", label: "Scouting" },
  { href: "/picks", label: "Picks & bans" },
  { href: "/opponents", label: "Opponents" },
];

export function PrepTabs() {
  const pathname = usePathname();
  const root = "/prep";

  return (
    // flex-wrap rather than overflow-x-auto. Setting overflow on one axis
    // computes the other from `visible` to `auto`, and the active tab's
    // underline sits at -bottom-px — one pixel of vertical overflow, which was
    // enough to put a scrollbar on a strip of short links and to clip the
    // underline it came from. Nine tabs wrap onto two rows on a phone; nothing
    // scrolls anywhere else.
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((tab) => {
        const href = `${root}${tab.href}`;
        // Prefix, not equality: /prep/opponents/uba has to keep Opponents lit,
        // and so do /prep/tierlists/[slug] and /prep/scouting's filtered views.
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "label-nav relative shrink-0 px-3 py-2 transition-colors",
              active ? "text-gold-bright" : "text-grey-light hover:text-white",
            )}
          >
            {tab.label}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-gold" />}
          </Link>
        );
      })}
    </nav>
  );
}
