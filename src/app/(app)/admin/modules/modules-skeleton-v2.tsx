import { TableSkeleton } from "@/components/ui/table-skeleton";

export function TeamV2Skeleton() {
  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[280px_1fr] xl:grid-cols-[300px_1fr]">
      {/* 左侧架构树骨架 */}
      <div className="space-y-4 rounded-2xl border border-stone-200 bg-[#FAFAFB] p-5">
        <div className="h-4 w-24 animate-pulse rounded bg-stone-200" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-xl border border-stone-200 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 animate-pulse rounded bg-stone-200" />
                <div className="h-4 w-8 animate-pulse rounded-full bg-stone-100" />
              </div>
              <div className="ml-3 space-y-1.5 pt-2">
                <div className="h-3.5 w-24 animate-pulse rounded bg-stone-100" />
                <div className="h-3.5 w-28 animate-pulse rounded bg-stone-100" />
              </div>
            </div>
          ))}
        </div>
        <div className="pt-4">
          <div className="h-9 w-full animate-pulse rounded-lg bg-stone-200" />
        </div>
      </div>

      {/* 中侧成员矩阵骨架 */}
      <div className="space-y-6">
        {/* 审批区骨架 */}
        <div className="rounded-2xl border border-stone-200 bg-[#FAFAFB] p-4">
          <div className="flex items-center gap-3">
            <div className="h-4.5 w-28 animate-pulse rounded bg-stone-200" />
            <div className="h-5 w-12 animate-pulse rounded-full bg-stone-200" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="h-14 animate-pulse rounded-xl border border-stone-200 bg-white" />
            <div className="h-14 animate-pulse rounded-xl border border-stone-200 bg-white" />
          </div>
        </div>

        {/* 成员面板骨架 */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
            <div className="h-9 w-64 animate-pulse rounded-xl bg-stone-100" />
            <div className="h-4 w-28 animate-pulse rounded bg-stone-200" />
          </div>
          
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-[#FAFAFB] p-4"
              >
                <div className="space-y-2">
                  <div className="h-4 w-20 animate-pulse rounded bg-stone-200" />
                  <div className="h-3 w-32 animate-pulse rounded bg-stone-100" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-12 animate-pulse rounded-full bg-stone-200" />
                  <div className="h-5 w-5 animate-pulse rounded bg-stone-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
