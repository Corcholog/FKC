import { createClient } from "@supabase/supabase-js";

// The client the public demo reads through. Publishable key, and — the point of
// the file — **no cookie jar**, so it never picks up a visitor's session.
//
// That matters because /demo is reachable while signed in (you have to be able
// to check what the public sees). With the cookie-aware server client from
// server.ts, a signed-in reviewer's demo page would run as `authenticated` and
// RLS would happily hand back the real tables — so a demo page that queried
// `players` by mistake would render real names for exactly the people least
// likely to notice, and aliases for everyone else. Here the JWT is always
// `anon`, which RLS denies on every base table, so that same mistake fails
// closed with a permission error.
//
// Pair it with demoSource() from src/lib/data-source.ts: this client can only
// usefully read the demo_* views, which is all the demo should ever want.
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
