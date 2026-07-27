import { createClient } from "@supabase/supabase-js";

// Server-side only — bypasses RLS via the secret key. Used by /api/sync
// (Phase 3) since Vercel Cron has no interactive user session to authenticate.
// Never import this from a Client Component or expose SUPABASE_SECRET_KEY to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
