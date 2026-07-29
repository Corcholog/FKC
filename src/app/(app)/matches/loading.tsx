import { Skeleton } from "@/components/ui/skeleton";
import { MatchRowSkeleton } from "@/components/match-row-skeleton";

export default function MatchesLoading() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-44 rounded-lg" />
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <MatchRowSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
