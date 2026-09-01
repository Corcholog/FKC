"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Real routes rather than the Tabs component, for the reason the team and draft
// strips both give: each panel is a server component doing its own query, so it
// should be linkable, refreshable and individually streamable. Settings is the
// strongest case in the app for it — several unrelated concerns were sharing one
// function body, and every one of their queries ran before any of them rendered.

const TABS = [
  { href: "", label: "Roster" },
  { href: "/sync", label: "Sync" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const root = "/settings";

  return (
    // flex-wrap rather than overflow-x-auto: setting overflow on one axis
    // computes the other from `visible` to `auto`, and the active tab's
    // underline sits at -bottom-px — one pixel of vertical overflow, which is
    // enough to put a scrollbar on a strip of short links and clip the
    // underline it came from.
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((tab) => {
        const href = `${root}${tab.href}`;
        // Exact for the index, prefix for the rest — the same rule the other two
        // strips use, so a future /settings/sync/x keeps Sync lit.
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
