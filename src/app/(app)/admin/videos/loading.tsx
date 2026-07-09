import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function VideosLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Skeleton className="h-8 w-40" />
      <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-60 ml-auto" />
        </div>
        <TableSkeleton columnCount={8} rowCount={6} />
      </div>
    </div>
  );
}
