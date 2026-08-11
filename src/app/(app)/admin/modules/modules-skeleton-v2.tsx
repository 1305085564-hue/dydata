export function TeamV2Skeleton() {
  return (
    <div className="mt-4 w-full space-y-6">
      {/* 审批区骨架 */}
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
        <div className="flex items-center gap-3">
          <div className="h-4.5 w-28 animate-pulse rounded bg-zinc-200" />
          <div className="h-5 w-12 animate-pulse rounded-full bg-zinc-200" />
        </div>
        <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
          <div className="h-20 animate-pulse rounded-xl border border-zinc-200 bg-white" />
          <div className="h-20 animate-pulse rounded-xl border border-zinc-200 bg-white" />
        </div>
      </div>

      {/* 满宽成员面板骨架 */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-zinc-100 pb-5">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="h-9.5 w-44 animate-pulse rounded-xl bg-zinc-100" />
            <div className="h-9.5 w-full max-w-sm animate-pulse rounded-xl bg-zinc-100" />
            <div className="h-9.5 w-24 animate-pulse rounded-xl bg-zinc-100" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-7 w-28 animate-pulse rounded-lg bg-zinc-100" />
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-200" />
          </div>
        </div>

        <div className="mt-5 grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-20 animate-pulse rounded bg-zinc-200" />
                  <div className="h-3.5 w-32 animate-pulse rounded bg-zinc-100" />
                </div>
                <div className="h-5.5 w-12 animate-pulse rounded-full bg-zinc-100" />
              </div>
              <div className="mt-3 flex gap-1.5">
                <div className="h-5 w-20 animate-pulse rounded-lg bg-zinc-100" />
                <div className="h-5 w-14 animate-pulse rounded-lg bg-zinc-100" />
              </div>
              <div className="mt-4 border-t border-zinc-100 pt-3">
                <div className="h-6.5 w-24 animate-pulse rounded bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
