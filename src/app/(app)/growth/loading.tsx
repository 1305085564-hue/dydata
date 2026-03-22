import { ChartSkeleton } from "@/components/charts/chart-skeleton";

export default function GrowthLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12 animate-pulse">
      {/* 标题 */}
      <div className="space-y-2">
        <div className="h-8 w-32 rounded bg-muted" />
        <div className="h-4 w-56 rounded bg-muted" />
      </div>

      {/* 状态卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-background p-4 space-y-2">
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-7 w-20 rounded bg-muted" />
            <div className="h-3 w-12 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* 能力维度 */}
      <div className="rounded-xl border bg-background p-5 space-y-3">
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted" />
          ))}
        </div>
      </div>

      {/* 图表 */}
      <ChartSkeleton className="h-[280px]" />

      {/* 诊断卡 */}
      <div className="rounded-xl border bg-background p-5 space-y-3">
        <div className="h-5 w-20 rounded bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
