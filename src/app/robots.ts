import type { MetadataRoute } from "next";

// Nothing here should be indexed.
//
// The app itself is behind a login, so a crawler only ever sees /login. /demo is
// reachable without one, but it is a link you hand to someone rather than a page
// that should rank — and an indexed demo would put a cached snapshot of a live
// roster's numbers in a search engine, which is not something the aliases
// protect against.
//
// The layout under /demo also sets `robots: { index: false }` in its metadata.
// Both, on purpose: this file is what a crawler reads before requesting
// anything, the meta tag is what it reads if it arrives at the page some other
// way (a shared link, a preview card).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
