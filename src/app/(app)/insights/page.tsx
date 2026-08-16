import { createClient } from "@/lib/supabase/server";
import { privateSource } from "@/lib/data-source";
import { buildInsights, fetchInsightsRows } from "@/lib/loaders/insights";
import { InsightsView } from "@/components/insights/insights-view";

export default async function InsightsPage() {
  const supabase = await createClient();
  const insights = buildInsights(await fetchInsightsRows(privateSource(supabase)));

  return <InsightsView insights={insights} />;
}
