"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function Navbar() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-navy px-4 py-3 sm:px-6">
      <Link href="/" className="font-semibold text-white">
        Fake Clan
      </Link>

      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-sm text-grey-light transition-colors hover:text-white">
          Admin
        </Link>
        {/* Sync engine lands in Phase 3; key-expiry indicator lands in Phase 7 */}
        <button
          type="button"
          disabled
          title="Coming in Phase 3"
          className="rounded-md bg-blue-muted px-3 py-1.5 text-sm text-grey-light opacity-50"
        >
          Sync
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-sm text-grey-light transition-colors hover:text-white"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
