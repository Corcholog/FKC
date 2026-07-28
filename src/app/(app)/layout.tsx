import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/navbar";
import { KeyExpiredBanner } from "@/components/key-expired-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: state } = await supabase
    .from("sync_state")
    .select("riot_key_valid")
    .eq("id", 1)
    .single();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Navbar />
      {state && !state.riot_key_valid && <KeyExpiredBanner />}
      {children}
    </div>
  );
}
