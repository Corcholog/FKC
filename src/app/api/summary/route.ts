import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePlayerSummary } from "@/lib/summary";
import { GeminiApiError } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { playerId } = (await request.json()) as { playerId?: string };
  if (!playerId) {
    return NextResponse.json({ error: "playerId is required" }, { status: 400 });
  }

  try {
    const result = await generatePlayerSummary(supabase, playerId);
    if ("notEnoughData" in result) {
      return NextResponse.json({ notEnoughData: true });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof GeminiApiError
        ? "Gemini couldn't generate a summary right now (quota or API issue). Try again later."
        : e instanceof Error
          ? e.message
          : "Failed to generate summary.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
