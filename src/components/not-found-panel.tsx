import Link from "next/link";
import { SearchX } from "lucide-react";

/**
 * Shared body for both 404 routes.
 *
 * There are two because they render in different places: (app)/not-found.tsx
 * sits inside the app layout and keeps the navbar, which is what every
 * notFound() call in the app actually hits (an unknown player slug, an
 * out-of-range /matches page). The root one only catches URLs that match no
 * route at all, where there's no navbar to keep.
 */
export function NotFoundPanel() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center sm:px-6">
      <SearchX className="size-8 text-[var(--color-grey-mid)]" aria-hidden />

      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-xl font-semibold text-[var(--color-white)]">
          Not found
        </h1>
        <p className="text-sm text-[var(--color-grey-light)]">
          That page doesn&apos;t exist — the player may have been renamed, or the link is
          stale.
        </p>
      </div>

      <Link
        href="/"
        className="rounded-lg bg-[var(--color-gold)] px-4 py-2 text-sm font-medium text-[var(--color-bg-primary)] transition-colors hover:bg-[var(--color-gold-bright)]"
      >
        Back to the dashboard
      </Link>
    </main>
  );
}
