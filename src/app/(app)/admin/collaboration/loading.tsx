import { Skeleton } from "@/components/ui/skeleton";

export default function CollaborationLoading() {
  return (
    <div className="space-y-4">
      {/* Month selector skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-6 w-28 rounded-md" />
      </div>

      {/* Health bar skeleton */}
      <Skeleton className="h-12 w-full rounded-xl" />

      {/* Tabs skeleton */}
      <div className="flex gap-2 border-b border-[#E5E0D6] pb-2">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {/* Table Skeleton */}
      <div className="rounded-xl border border-[#E5E0D6] bg-white p-4 space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
