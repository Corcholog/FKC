import { Skeleton } from "@/components/ui/skeleton";

function PanelSkeleton({ height }: { height: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg-secondary p-4">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className={`w-full ${height}`} />
    </div>
  );
}

export default function InsightsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>

      <PanelSkeleton height="h-70" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PanelSkeleton height="h-52" />
        <PanelSkeleton height="h-52" />
        <PanelSkeleton height="h-52" />
        <PanelSkeleton height="h-52" />
      </div>

      <PanelSkeleton height="h-44" />
    </main>
  );
}
