import { Skeleton } from "@/components/ui/skeleton";
import { MatchRowSkeleton } from "@/components/match-row-skeleton";

export default function MatchesLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      {/* The filter strip. Six tabs, so the placeholder is a row of chips rather
          than the one select this page used to carry. */}
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-md" />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <MatchRowSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
