import { Skeleton } from "@/components/ui/skeleton";

// Covers the whole section: the layout (heading + tab strip) stays put and only
// the page body swaps, so this is what sits under the tabs while any of them
// load.
export default function ScrimsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-sm" />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-56 rounded-sm" />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-sm" />
        ))}
      </div>
    </div>
  );
}
