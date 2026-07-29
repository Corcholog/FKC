import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { KeyExpiredBanner } from "@/components/key-expired-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data: state }, session] = await Promise.all([
    supabase.from("sync_state").select("riot_key_valid, last_sync_status").eq("id", 1).single(),
    getSession(),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Navbar
        initialSyncing={state?.last_sync_status === "running"}
        accountLabel={session?.player?.display_name ?? session?.user.email ?? null}
      />
      {state && !state.riot_key_valid && <KeyExpiredBanner />}
      {children}
    </div>
  );
}
