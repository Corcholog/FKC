import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Reachable without a session. /login is also the one path a *signed-in* user
// gets bounced away from — see the two separate checks below.
const PUBLIC_PATHS = ["/login"];

// Public subtrees, matched by prefix. The demo is anonymized at the database
// level (migration 018) and read through a session-less client, so it is public
// in both directions: signed out to show a stranger, and signed in so the people
// who own the data can check what that stranger actually sees.
const PUBLIC_PREFIXES = ["/demo"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Must call getUser() (not getSession()) here — it revalidates the token
  // against Supabase rather than trusting the cookie, which is what actually
  // keeps the session alive/refreshed on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // API routes handle their own auth (e.g. /api/sync accepts either a session
  // or a CRON_SECRET bearer token) and must return JSON, not an HTML redirect.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  if (!user && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Only /login bounces a signed-in user, and only because a login form is
  // meaningless once you have a session. Sending them away from /demo would
  // make the demo unreviewable by the only people who can tell whether an alias
  // slipped — so this check is deliberately narrower than the one above.
  if (user && PUBLIC_PATHS.includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
