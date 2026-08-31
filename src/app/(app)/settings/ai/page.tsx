import { createClient } from "@/lib/supabase/server";
import { maybeRow } from "@/lib/supabase/read";
import { formatRelativeTime } from "@/lib/format";
import { ClanContextForm } from "@/components/settings/clan-context-form";
import { SectionCard } from "@/components/section-card";

export default async function SettingsAiPage() {
  const supabase = await createClient();

  const [clanProfile, teamSummary] = await Promise.all([
    supabase
      .from("clan_profile")
      .select("context")
      .eq("id", 1)
      .maybeSingle<{ context: string | null }>(),
    supabase
      .from("team_ai_summary")
      .select("generated_at")
      .eq("id", 1)
      .maybeSingle<{ generated_at: string | null }>(),
  ]);

  const profile = maybeRow(clanProfile, "clan context");
  const summary = maybeRow(teamSummary, "team recap timestamp");

  return (
    <SectionCard title="Clan context">
      <ClanContextForm
        initialContext={profile?.context ?? null}
        // Formatted on the server on purpose: the form is a client component, so
        // formatting there would run once here and again at hydration off two
        // different clocks. SyncStatusSection documents the same trap.
        lastGeneratedAgo={
          summary?.generated_at ? formatRelativeTime(summary.generated_at) : null
        }
      />
    </SectionCard>
  );
}
