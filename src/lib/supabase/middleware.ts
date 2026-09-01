import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Reachable without a session. /login is also the one path a *signed-in* user
// gets bounced away from — see the two separate checks below.
const PUBLIC_PATHS = ["/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
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
  // meaningless once you have a session. Nothing else is public, so there is
  // nothing else to send a signed-in visitor away from.
  if (user && PUBLIC_PATHS.includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
