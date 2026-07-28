"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function Navbar() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(data.error ?? "Sync failed.");
      } else {
        setSyncMessage(`Synced: ${data.newMatches} new match(es), ${data.playersProcessed} player(s).`);
      }
      // Refresh either way — a failed sync may have just flipped riot_key_valid,
      // and the banner/status live in server-rendered layout data.
      router.refresh();
    } catch {
      setSyncMessage("Sync failed — network error.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <header className="flex flex-col gap-2 border-b border-border bg-navy px-4 py-3 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-semibold text-white">
          Fake Clan
        </Link>

        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-grey-light transition-colors hover:text-white">
            Admin
          </Link>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-md bg-blue-muted px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-primary disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync"}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm text-grey-light transition-colors hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>

      {syncMessage && <p className="text-xs text-grey-light">{syncMessage}</p>}
    </header>
  );
}
