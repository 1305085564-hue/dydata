import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Skeleton className="h-8 w-40" />
      <div className="space-y-4 border-b border-[#ECE7DE]/80 pb-8">
        <Skeleton className="h-5 w-28" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
      <div className="space-y-4 border-b border-[#ECE7DE]/80 pb-8">
        <Skeleton className="h-5 w-28" />
        <TableSkeleton columnCount={6} rowCount={5} />
      </div>
      <div className="space-y-4 pb-8">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}
