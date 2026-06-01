import { Skeleton } from "@/components/ui/skeleton";

/**
 * 导粉中心主页骨架屏 — 还原最终版面节奏，让首屏不再白闪。
 * 仅勾勒视觉框架，× 渐变 / × 多余装饰，符合纸质仪器规范。
 */
export default function ViolationsLoading() {
  return (
    <div className="min-h-screen bg-[#F0F0F1]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {/* Hero header */}
        <header className="rounded-2xl border border-zinc-200 bg-white px-6 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-20 rounded-md" />
              <Skeleton className="h-7 w-44 rounded-lg" />
              <Skeleton className="h-3.5 w-72 rounded-md" />
            </div>
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
          <div className="mt-5 border-t border-zinc-100 pt-4">
            <Skeleton className="h-9 w-72 rounded-xl" />
          </div>
        </header>

        {/* Dual rank boards */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-200 bg-white p-5"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="size-1.5 rounded-full" />
                <Skeleton className="h-3.5 w-24 rounded-md" />
              </div>
              <div className="mt-3 space-y-1.5">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="flex items-center gap-3 px-2 py-2">
                    <Skeleton className="size-3 rounded-full" />
                    <Skeleton className="h-3.5 flex-1 rounded-md" />
                    <Skeleton className="h-3.5 w-12 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Filter bar */}
        <Skeleton className="h-9 w-full max-w-md rounded-lg" />

        {/* Two-column card grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
            >
              <Skeleton className="h-36 w-full rounded-none" />
              <div className="space-y-2.5 px-4 py-3.5">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-4 w-12 rounded-md" />
                  <Skeleton className="h-4 w-10 rounded-md" />
                </div>
                <Skeleton className="h-3.5 w-full rounded-md" />
                <Skeleton className="h-3.5 w-5/6 rounded-md" />
                <Skeleton className="h-3.5 w-3/4 rounded-md" />
              </div>
              <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2.5">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-7 w-12 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
