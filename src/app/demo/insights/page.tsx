import { createPublicClient } from "@/lib/supabase/public";
import { demoSource } from "@/lib/data-source";
import { cachedDemoLoad } from "@/lib/loaders/demo-cache";
import { buildInsights, fetchInsightsRows } from "@/lib/loaders/insights";
import { InsightsView } from "@/components/insights/insights-view";

export const dynamic = "force-dynamic";

// The page the data cache exists for.
//
// fetchInsightsRows reads the whole participant table for tracked players, which
// is the most expensive read in the app. Behind cachedDemoLoad a link passed
// around a coaching staff costs one of those an hour rather than one per person.
export default async function DemoInsightsPage() {
  const rows = await cachedDemoLoad("insights", () =>
    fetchInsightsRows(demoSource(createPublicClient())),
  );

  return <InsightsView insights={buildInsights(rows, "/demo")} basePath="/demo" />;
}
