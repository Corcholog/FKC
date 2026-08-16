"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Real routes rather than the Tabs component: each of these is a server
// component doing its own query, so they should be linkable, refreshable and
// individually streamable. The tab strip is the only part that needs the
// pathname, so it's the only client component in the section shell.

const TABS = [
  { href: "", label: "Overview" },
  { href: "/history", label: "History" },
  { href: "/drafts", label: "Drafts" },
  { href: "/opponents", label: "Opponents" },
];

export function ScrimTabs({ basePath = "" }: { basePath?: string }) {
  const pathname = usePathname();
  const root = `${basePath}/scrims`;

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
        // Exact for the index, prefix for the rest — /scrims/opponents/uba has
        // to keep Opponents lit. /scrims/new and /scrims/[id] match none of
        // them, which is right: they aren't tabs.
        const active =
          tab.href === ""
            ? pathname === root
            : pathname === href || pathname.startsWith(`${href}/`);

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
