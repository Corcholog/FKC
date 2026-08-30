import Link from "next/link";
import { SCOPES, SCOPE_CAPTIONS, SCOPE_LABELS, type ScopeName } from "@/lib/scope";
import { cn } from "@/lib/utils";

/**
 * Which games a page is counting, as links rather than a control.
 *
 * Links, not a select: each scope is a different page with a different query,
 * so it should be linkable, refreshable and back-buttonable — the same call
 * the section tab strips make. It also keeps this a server component, so the
 * page stays free of client JavaScript for what is a navigation.
 *
 * The caption is not decoration. "Ranked" and "Everything" differ by a whole
 * source, and a page that silently changed what it was counting would be worse
 * than one that never offered to.
 */
export function ScopeSwitch({
  active,
  basePath,
  sample,
}: {
  active: ScopeName;
  /** The page this switches on, without a query string. */
  basePath: string;
  /** "12 soloQ, 4 flex, 6 team" — what the current scope actually found. */
  sample?: string;
}) {
  const scopes = Object.keys(SCOPES) as ScopeName[];

  return (
    <div className="flex flex-col gap-1.5">
      <nav className="flex flex-wrap gap-1">
        {scopes.map((scope) => {
          const isActive = scope === active;
          return (
            <Link
              key={scope}
              // The default scope drops the parameter rather than spelling it
              // out, so the plain URL stays the canonical one and nothing
              // bookmarked before any of this existed looks different.
              href={scope === "soloq" ? basePath : `${basePath}?scope=${scope}`}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-gold-muted text-white"
                  : "text-grey-light hover:bg-bg-tertiary hover:text-white",
              )}
            >
              {SCOPE_LABELS[scope]}
            </Link>
          );
        })}
      </nav>
      <p className="text-xs text-grey-mid">
        {SCOPE_CAPTIONS[active]}
        {sample ? ` ${sample}.` : ""}
      </p>
    </div>
  );
}
