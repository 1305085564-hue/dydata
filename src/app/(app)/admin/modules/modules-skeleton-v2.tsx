export function TeamV2Skeleton() {
  return (
    <div className="mt-4 w-full space-y-5">
      {/* 满宽成员面板骨架（与 modules-content-v3 1:1 对齐） */}
      <div className="rounded-xl border border-[#E5E0D6] bg-transparent p-5">
        {/* 工具栏骨架 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3.5 mb-3.5 border-b border-[#ECE7DE]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-8 w-24 animate-pulse-claude rounded-md bg-[#F5F3EE]" />
            <span className="text-[#ECE7DE] select-none">|</span>
            <div className="h-8 w-20 animate-pulse-claude rounded-md bg-[#F5F3EE]" />
            <span className="text-[#ECE7DE] select-none">|</span>
            <div className="h-8 w-48 sm:w-56 animate-pulse-claude rounded-full bg-[#F5F3EE]" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-4 w-28 animate-pulse-claude rounded bg-[#F5F3EE]" />
            <div className="h-4 w-12 animate-pulse-claude rounded bg-[#F5F3EE]" />
          </div>
        </div>

        {/* 双列高密度列表骨架 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-1">
          {/* 左列 */}
          <div>
            <div className="hidden lg:flex items-center justify-between border-b border-[#E5E0D6] pb-2 mb-2 px-3">
              <div className="h-3.5 w-10 animate-pulse-claude rounded bg-[#F5F3EE]" />
              <div className="flex items-center gap-4">
                <div className="h-3.5 w-8 animate-pulse-claude rounded bg-[#F5F3EE]" />
                <div className="h-3.5 w-12 animate-pulse-claude rounded bg-[#F5F3EE]" />
                <div className="w-8" />
              </div>
            </div>
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`left-${index}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-md min-h-[40px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="size-3.5 animate-pulse-claude rounded bg-[#F5F3EE] shrink-0" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="h-4 w-24 animate-pulse-claude rounded bg-[#E5E0D6]" />
                      <div className="h-3 w-36 animate-pulse-claude rounded bg-[#F5F3EE]" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="h-4 w-10 animate-pulse-claude rounded bg-[#F5F3EE] shrink-0" />
                    <div className="h-3.5 w-20 animate-pulse-claude rounded bg-[#F5F3EE] shrink-0" />
                    <div className="h-4 w-8 animate-pulse-claude rounded bg-[#F5F3EE] shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右列 */}
          <div>
            <div className="hidden lg:flex items-center justify-between border-b border-[#E5E0D6] pb-2 mb-2 px-3">
              <div className="h-3.5 w-10 animate-pulse-claude rounded bg-[#F5F3EE]" />
              <div className="flex items-center gap-4">
                <div className="h-3.5 w-8 animate-pulse-claude rounded bg-[#F5F3EE]" />
                <div className="h-3.5 w-12 animate-pulse-claude rounded bg-[#F5F3EE]" />
                <div className="w-8" />
              </div>
            </div>
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`right-${index}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-md min-h-[40px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="size-3.5 animate-pulse-claude rounded bg-[#F5F3EE] shrink-0" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="h-4 w-24 animate-pulse-claude rounded bg-[#E5E0D6]" />
                      <div className="h-3 w-36 animate-pulse-claude rounded bg-[#F5F3EE]" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="h-4 w-10 animate-pulse-claude rounded bg-[#F5F3EE] shrink-0" />
                    <div className="h-3.5 w-20 animate-pulse-claude rounded bg-[#F5F3EE] shrink-0" />
                    <div className="h-4 w-8 animate-pulse-claude rounded bg-[#F5F3EE] shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
