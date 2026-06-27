import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Skeleton className="h-8 w-32" />
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-64" />
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Skeleton className="h-5 w-36" />
        <TableSkeleton columnCount={7} rowCount={5} />
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Skeleton className="h-5 w-32" />
        <TableSkeleton columnCount={7} rowCount={5} />
      </div>
    </div>
  );
}
