import { Skeleton } from "@/components/ui/skeleton";

export default function ContentToolsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12 py-8 px-4 sm:px-6">
      {/* Hero */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-stone-200 bg-white p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Work area */}
      <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-48" />
        <div className="space-y-2 pt-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
