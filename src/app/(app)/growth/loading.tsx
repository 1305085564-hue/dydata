import { Skeleton } from "@/components/ui/skeleton";

export default function GrowthLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-16 pt-8">
      {/* 顶部标题栏与全局可信度 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 bg-stone-200" />
          <Skeleton className="h-4 w-96 bg-stone-200" />
        </div>
        <Skeleton className="h-8 w-44 rounded-full bg-stone-200" />
      </div>

      {/* P0: 核心体检结论大卡 */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-36 bg-stone-200" />
            <Skeleton className="h-6 w-80 bg-stone-200" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full bg-stone-200" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20 bg-stone-200" />
            <Skeleton className="h-10 w-full bg-stone-100" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28 bg-stone-200" />
            <Skeleton className="h-12 w-full bg-stone-100" />
          </div>
        </div>
      </div>

      {/* P1: 能力雷达 + 核心指标概览 */}
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* 左：雷达图骨架 */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
          <Skeleton className="h-5 w-24 bg-stone-200" />
          <Skeleton className="h-4 w-60 bg-stone-100" />
          <div className="flex items-center justify-center py-4">
            <Skeleton className="h-[220px] w-[220px] rounded-full bg-stone-200" />
          </div>
          <div className="flex items-center justify-center gap-3">
            <Skeleton className="h-8 w-24 rounded-full bg-stone-100" />
            <Skeleton className="h-8 w-24 rounded-full bg-stone-100" />
          </div>
        </div>

        {/* 右：指标概览骨架 */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32 bg-stone-200" />
            <Skeleton className="h-4 w-80 bg-stone-100" />
          </div>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-12 bg-stone-200" />
                  <Skeleton className="h-3.5 w-3.5 rounded-full bg-stone-200" />
                </div>
                <Skeleton className="h-8 w-16 bg-stone-200" />
                <Skeleton className="h-4 w-12 bg-stone-200" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* P2: 折叠区骨架 */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-stone-200 bg-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded-lg bg-stone-200" />
            <div className="space-y-1">
              <Skeleton className="h-4.5 w-32 bg-stone-200" />
              <Skeleton className="h-3 w-56 bg-stone-100" />
            </div>
          </div>
          <Skeleton className="h-5 w-5 bg-stone-200" />
        </div>
      ))}
    </div>
  );
}
