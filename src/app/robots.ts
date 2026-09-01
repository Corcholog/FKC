import type { MetadataRoute } from "next";

// Nothing here should be indexed.
//
// Every route is behind a login, so a crawler only ever sees /login. Saying so
// explicitly is still worth a file: this is what a crawler reads before
// requesting anything, so it never gets as far as the redirect.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
