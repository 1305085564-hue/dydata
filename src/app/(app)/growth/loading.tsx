import { Skeleton } from "@/components/ui/skeleton";

export default function GrowthLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-16">
      {/* 顶部标题栏与阶段标识 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 bg-zinc-200" />
          <Skeleton className="h-4 w-96 bg-zinc-200" />
        </div>
        <Skeleton className="h-8 w-44 rounded-full bg-zinc-200" />
      </div>

      {/* 主卡槽位（进度卡 / 诊断卡） */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-36 bg-zinc-200" />
            <Skeleton className="h-6 w-80 bg-zinc-200" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full bg-zinc-200" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20 bg-zinc-200" />
            <Skeleton className="h-10 w-full bg-zinc-100" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28 bg-zinc-200" />
            <Skeleton className="h-12 w-full bg-zinc-100" />
          </div>
        </div>
      </div>

      {/* 体征数据条 */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="grid grid-cols-2 gap-px bg-zinc-100 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white px-4 py-4 space-y-2">
              <Skeleton className="h-3 w-12 bg-zinc-200" />
              <Skeleton className="h-6 w-16 bg-zinc-200" />
            </div>
          ))}
        </div>
      </div>

      {/* 趋势区双卡 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[320px] w-full rounded-2xl bg-zinc-200" />
        <Skeleton className="h-[320px] w-full rounded-2xl bg-zinc-200" />
      </div>

      {/* 能力画像 + 同伴 */}
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <Skeleton className="h-5 w-24 bg-zinc-200" />
          <div className="flex items-center justify-center py-4">
            <Skeleton className="h-[220px] w-[220px] rounded-full bg-zinc-200" />
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <Skeleton className="h-5 w-32 bg-zinc-200" />
          <Skeleton className="h-[200px] w-full bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}
