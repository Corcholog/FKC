"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Users, Swords, Trophy, Settings, Menu, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/team", label: "Team", icon: Users },
  { href: "/matches", label: "Matches", icon: Swords },
  { href: "/champions", label: "Champions", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

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
}: {
  initialSyncing?: boolean;
  /** Who's signed in — the linked player's display name, or their email. */
  accountLabel?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(initialSyncing);
  const [sheetOpen, setSheetOpen] = useState(false);

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
        toast.success(`Synced: ${data.newMatches} new match(es), ${data.playersProcessed} player(s).`);
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

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                Icon={item.icon}
                active={pathname === item.href}
              />
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
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

          {accountLabel && (
            <Link
              href="/account"
              className={cn(
                "hidden max-w-40 items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-sm transition-colors sm:inline-flex",
                pathname === "/account" ? "text-gold-bright" : "text-grey-light hover:text-white",
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
              className="md:hidden"
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="bg-bg-secondary">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Crest />
                  Fake Clan
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-2">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    Icon={item.icon}
                    active={pathname === item.href}
                    onNavigate={() => setSheetOpen(false)}
                  />
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2 border-t border-border p-4 sm:hidden">
                {accountLabel && (
                  <NavLink
                    href="/account"
                    label={accountLabel}
                    Icon={UserRound}
                    active={pathname === "/account"}
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
