"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function SyncSpinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin text-white"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function Navbar({ initialSyncing = false }: { initialSyncing?: boolean }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(initialSyncing);
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
      <div className="flex items-center justify-between gap-2">
        <Link href="/" className="font-semibold text-white">
          Fake Clan
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/admin"
            className="text-sm text-grey-light transition-colors hover:text-white"
          >
            Admin
          </Link>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-md bg-blue-muted px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-primary disabled:opacity-50"
          >
            {syncing && <SyncSpinner />}
            <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync"}</span>
            <span className="sm:hidden">{syncing ? "…" : "Sync"}</span>
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
