import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function ContentLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Skeleton className="h-8 w-40" />
      <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
        <Skeleton className="h-5 w-28" />
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-60" />
        </div>
        <TableSkeleton columnCount={9} rowCount={6} />
      </div>
    </div>
  );
}
