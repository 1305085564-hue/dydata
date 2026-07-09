import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Skeleton className="h-8 w-40" />
      <div className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <Skeleton className="h-5 w-28" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <Skeleton className="h-5 w-28" />
        <TableSkeleton columnCount={6} rowCount={5} />
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}
