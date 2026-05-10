import { Skeleton } from "@/components/ui/skeleton";

export default function GrowthLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* 标题 */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* 状态卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>

      {/* 能力维度 */}
      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
        <Skeleton className="h-5 w-24" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>

      {/* 图表 */}
      <Skeleton className="h-[280px]" />

      {/* 诊断卡 */}
      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
        <Skeleton className="h-5 w-20" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>
    </div>
  );
}
