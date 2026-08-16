import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Page links rather than a client-side "load more": /matches is a Server
// Component with no client data fetching anywhere, and a plain <Link> keeps it
// that way — the page number lives in the URL, so a specific page is
// shareable, bookmarkable, and survives a refresh.

export function matchesHref(playerSlug: string | null, page: number, basePath = ""): string {
  const params = new URLSearchParams();
  if (playerSlug) params.set("player", playerSlug);
  // Page 1 is the canonical bare URL — no ?page=1 cluttering the common case.
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${basePath}/matches?${query}` : `${basePath}/matches`;
}

function PageLink({
  href,
  label,
  icon,
  iconSide,
}: {
  /** Null at the first/last page — renders as a disabled-looking span. */
  href: string | null;
  label: string;
  icon: React.ReactNode;
  iconSide: "start" | "end";
}) {
  const className = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    !href && "pointer-events-none opacity-40",
  );

  const body = (
    <>
      {iconSide === "start" && icon}
      {label}
      {iconSide === "end" && icon}
    </>
  );

  // A disabled control must not be a link — an <a> with no href is still
  // focusable in some browsers and reads as actionable to a screen reader.
  return href ? (
    <Link href={href} className={className} prefetch={false}>
      {body}
    </Link>
  ) : (
    <span className={className} aria-disabled="true">
      {body}
    </span>
  );
}

export function MatchesPagination({
  page,
  totalPages,
  totalMatches,
  playerSlug,
  basePath = "",
}: {
  page: number;
  totalPages: number;
  /** Total matching *matches*, not rendered rows — one match can list several tracked players. */
  totalMatches: number;
  playerSlug: string | null;
  /** "/demo" on the public copy. */
  basePath?: string;
}) {
  if (totalMatches === 0) return null;

  return (
    <nav
      aria-label="Match history pages"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
    >
      <p className="text-xs text-grey-mid">
        <span className="tabular-nums">{totalMatches.toLocaleString("en-US")}</span> match
        {totalMatches === 1 ? "" : "es"} tracked
        {totalPages > 1 && (
          <>
            {" · page "}
            <span className="tabular-nums">{page}</span> of{" "}
            <span className="tabular-nums">{totalPages}</span>
          </>
        )}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <PageLink
            href={page > 1 ? matchesHref(playerSlug, page - 1, basePath) : null}
            label="Previous"
            icon={<ChevronLeft className="h-3.5 w-3.5" />}
            iconSide="start"
          />
          <PageLink
            href={page < totalPages ? matchesHref(playerSlug, page + 1, basePath) : null}
            label="Next"
            icon={<ChevronRight className="h-3.5 w-3.5" />}
            iconSide="end"
          />
        </div>
      )}
    </nav>
  );
}
