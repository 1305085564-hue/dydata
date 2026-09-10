import { Skeleton } from "@/components/ui/skeleton";

export default function CollaborationLoading() {
  return (
    <div className="space-y-6">
      {/* 整合型流线控制舱骨架 */}
      <div className="space-y-3.5 pb-4 border-b border-[#E2E2DF]/80">
        {/* 控制舱顶栏骨架 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2E2DF]/60">
          <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-[#E2E2DF] shadow-2xs">
            <Skeleton className="size-7 rounded" />
            <Skeleton className="h-7 w-32 sm:w-36 rounded" />
            <Skeleton className="size-7 rounded" />
          </div>
          <Skeleton className="h-6 w-32 rounded-full" />
        </div>

        {/* 4 个 Tab 骨架 */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
        </div>
      </div>

      {/* 表格骨架 */}
      <div className="rounded-xl bg-white shadow-card-ring overflow-hidden">
        <div className="border-b border-[#E2E2DF]/60 px-4 py-3 flex items-center justify-between">
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-14 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-14 rounded" />
        </div>
        <div className="divide-y divide-[#E2E2DF]/40">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="px-4 py-3.5 flex items-center justify-between">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-12 rounded" />
              <Skeleton className="h-4 w-12 rounded" />
              <Skeleton className="h-4 w-16 rounded" />
              <Skeleton className="h-4 w-16 rounded" />
              <Skeleton className="h-4 w-14 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

