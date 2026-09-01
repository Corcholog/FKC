import Link from "next/link";
import {
  DEFAULT_SOURCE,
  SOURCE_CAPTIONS,
  SOURCE_LABELS,
  SOURCE_NAMES,
  type SourceName,
} from "@/lib/scope";
import { cn } from "@/lib/utils";

/**
 * Which games a page is counting, as links rather than a control.
 *
 * Links, not a select: each source is a different page with a different query,
 * so it should be linkable, refreshable and back-buttonable — the same call the
 * section tab strips make. It also keeps this a server component, so the page
 * stays free of client JavaScript for what is a navigation.
 *
 * The caption is not decoration. "Everything" and "Competitive" differ by two
 * whole record types, and a page that silently changed what it was counting
 * would be worse than one that never offered to.
 */
export function SourceSwitch({
  active,
  basePath,
  sample,
  extraQuery,
}: {
  active: SourceName;
  /** The page this switches on, without a query string. */
  basePath: string;
  /** "12 soloQ, 4 flex, 6 team" — what the current source actually found. */
  sample?: string;
  /** Query parameters to carry across the switch, e.g. a selected account. */
  extraQuery?: Record<string, string | undefined>;
}) {
  const carried = Object.entries(extraQuery ?? {}).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <nav className="flex flex-wrap gap-1">
        {SOURCE_NAMES.map((source) => {
          const isActive = source === active;
          // The default drops the parameter rather than spelling it out, so the
          // plain URL stays the canonical one.
          const params = new URLSearchParams(carried);
          if (source !== DEFAULT_SOURCE) params.set("source", source);
          const query = params.toString();

          return (
            <Link
              key={source}
              href={query ? `${basePath}?${query}` : basePath}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-gold-muted text-white"
                  : "text-grey-light hover:bg-bg-tertiary hover:text-white",
              )}
            >
              {SOURCE_LABELS[source]}
            </Link>
          );
        })}
      </nav>
      <p className="text-xs text-grey-mid">
        {SOURCE_CAPTIONS[active]}
        {sample ? ` ${sample}.` : ""}
      </p>
    </div>
  );
}
