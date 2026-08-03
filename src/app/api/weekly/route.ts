import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { postWeeklyWrap } from "@/lib/weekly";

// The Sunday wrap. Its own route rather than a day-of-week branch inside
// /api/summaries, for the same reason the summaries batch is its own route
// instead of a server action: one cron entry, one handler, and the schedule
// lives in vercel.json where it can be read rather than in an `if` nobody
// remembers.
//
// Cheaper than the other two jobs — no Riot calls and no Gemini, just two
// Supabase reads and one webhook — but it keeps the same 60s ceiling for
// consistency with them.
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;

  // A signed-in user may trigger this by hand — unlike the standings, a wrap is
  // idempotent and self-contained, so re-posting one is a deliberate act rather
  // than a side effect of pressing an unrelated button.
  if (!isCron) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await postWeeklyWrap(createAdminClient());
    return NextResponse.json({ status: "success" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
