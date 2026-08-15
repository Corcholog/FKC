import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// robots.txt and sitemap.xml are excluded for the same reason as the static
// assets: a crawler arrives with no session, and gating them means the proxy
// answers a 307 to /login instead of the file. A robots.txt that redirects is a
// robots.txt that doesn't exist.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
