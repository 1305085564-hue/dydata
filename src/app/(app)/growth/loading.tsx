import { Skeleton } from "@/components/ui/skeleton";

export default function GrowthLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-10 pb-16">
      {/* 顶部标题栏与阶段标识 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#ECE7DE]/80 pb-6">
        <div className="space-y-2 min-w-0 max-w-full">
          <Skeleton className="h-8 w-44 sm:w-48 bg-[#E5E0D6]" />
          <Skeleton className="h-4 w-56 sm:w-96 max-w-full bg-[#E5E0D6]" />
        </div>
        <Skeleton className="h-8 w-44 rounded-full bg-[#E5E0D6]" />
      </div>

      {/* 主卡槽位（进度卡 / 诊断卡） */}
      <div className="border-b border-[#ECE7DE]/80 pb-8 space-y-5">
        <div className="flex items-center justify-between border-b border-[#ECE7DE] pb-4">
          <div className="space-y-2 min-w-0 max-w-full">
            <Skeleton className="h-3.5 w-36 bg-[#E5E0D6]" />
            <Skeleton className="h-6 w-52 sm:w-80 max-w-full bg-[#E5E0D6]" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full bg-[#E5E0D6]" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20 bg-[#E5E0D6]" />
            <Skeleton className="h-10 w-full bg-[#F5F3EE]" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28 bg-[#E5E0D6]" />
            <Skeleton className="h-12 w-full bg-[#F5F3EE]" />
          </div>
        </div>
      </div>

      {/* 体征数据条 */}
      <div className="border-b border-[#ECE7DE]/80 pb-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-[#F5F3EE] px-4 py-4 space-y-2">
              <Skeleton className="h-3 w-12 bg-[#E5E0D6]" />
              <Skeleton className="h-6 w-16 bg-[#E5E0D6]" />
            </div>
          ))}
        </div>
      </div>

      {/* 趋势区双卡 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[320px] w-full rounded-2xl bg-[#E5E0D6]" />
        <Skeleton className="h-[320px] w-full rounded-2xl bg-[#E5E0D6]" />
      </div>

      {/* 能力画像 + 同伴 */}
      <div className="grid gap-10 lg:grid-cols-[340px_1fr] border-b border-[#ECE7DE]/80 pb-10">
        <div className="space-y-4">
          <Skeleton className="h-5 w-24 bg-[#E5E0D6]" />
          <div className="flex items-center justify-center py-4">
            <Skeleton className="h-[220px] w-[220px] rounded-full bg-[#E5E0D6]" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-5 w-32 bg-[#E5E0D6]" />
          <Skeleton className="h-[200px] w-full bg-[#F5F3EE]" />
        </div>
      </div>
    </div>
  );
}
