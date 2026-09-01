import { Skeleton } from "@/components/ui/skeleton";

export default function TierListEditorLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-7 rounded-lg" />
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-7 w-20 rounded-lg" />
        <Skeleton className="h-7 w-20 rounded-lg" />
        <Skeleton className="h-7 w-32 rounded-lg" />
      </div>

      <div className="panel-hex overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-stretch border-b border-border last:border-b-0">
            <Skeleton className="h-17 w-14 rounded-none sm:w-24" />
            <div className="flex flex-1 flex-wrap gap-1 bg-bg-secondary p-1.5">
              {Array.from({ length: 6 - i }).map((_, j) => (
                <Skeleton key={j} className="h-14 w-14 rounded-sm" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="panel-hex flex flex-col gap-3 p-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-full rounded-lg" />
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 30 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-14 rounded-sm" />
          ))}
        </div>
      </div>
    </main>
  );
}
