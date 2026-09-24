export default function DashboardLoading() {
  return (
    <div className="w-full space-y-4 sm:space-y-5.5">
      {/* 顶部控制栏骨架：创作立卷 · 表达纪事（裸铺无框） */}
      <div className="px-0.5 py-1 sm:py-1.5">
        <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* 左侧：标题与副标 */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D97757]" />
              <div className="h-7 w-48 rounded-md bg-[#F1F1F0] animate-pulse-claude" />
            </div>
            <div className="h-4 w-64 rounded bg-[#F1F1F0] animate-pulse-claude" />
          </div>

          {/* 右侧：控制区按键 */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <div className="h-7 w-28 rounded-md bg-[#F1F1F0] animate-pulse-claude" />
            <div className="h-7 w-20 rounded-md bg-[#F1F1F0] animate-pulse-claude" />
            <div className="h-7 w-20 rounded-md bg-[#F1F1F0] animate-pulse-claude" />
          </div>
        </div>
      </div>

      {/* 主工作台骨架：对齐终态 w-full */}
      <div className="w-full">
        <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5 py-0">
          {/* 头部：标题与状态 */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 sm:pb-4 border-b border-[#E2E2DF]">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="h-5 w-36 rounded bg-[#F1F1F0] animate-pulse-claude" />
              <div className="h-6 w-24 rounded-full bg-[#F1F1F0] animate-pulse-claude" />
            </div>
            <div className="h-4 w-20 rounded bg-[#F1F1F0] animate-pulse-claude" />
          </div>

          {/* 双列网格：左侧截图/伙伴 + 右侧数据表单 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)] lg:gap-5 items-start">
            {/* 左栏：截图槽位 + 共创伙伴 */}
            <div className="flex min-w-0 flex-col gap-3 lg:gap-6">
              {/* 截图槽位 (对齐 2 个截图槽位终态) */}
              <div className="space-y-2">
                <div className="h-4 w-20 rounded bg-[#F1F1F0] animate-pulse-claude" />
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-2.5">
                  <div className="h-28 rounded-xl border border-dashed border-[#E2E2DF] bg-[#F1F1F0] animate-pulse-claude" />
                  <div className="h-28 rounded-xl border border-dashed border-[#E2E2DF] bg-[#F1F1F0] animate-pulse-claude" />
                </div>
              </div>

              {/* 共创伙伴 - 对齐终态底纸纯排版解套，单条发丝线自然分界 */}
              <div className="space-y-2.5 pt-2.5 border-t border-[#E2E2DF]/50 lg:flex-1">
                <div className="h-4 w-16 rounded bg-[#F1F1F0] animate-pulse-claude" />
                <div className="space-y-1.5">
                  <div className="h-8 rounded-lg bg-[#F1F1F0] border border-[#E2E2DF]/40 animate-pulse-claude" />
                  <div className="h-8 rounded-lg bg-[#F1F1F0] border border-[#E2E2DF]/40 animate-pulse-claude" />
                </div>
              </div>
            </div>

            {/* 右栏：核心指标 + 基础信息 + 导粉话术 + 提交（对齐终态纯排版平铺） */}
            <div className="flex min-w-0 flex-col gap-6">
              {/* 核心指标 */}
              <div className="space-y-4 pt-1 pb-1.5 lg:pb-2.5">
                <div className="h-4 w-24 rounded bg-[#F1F1F0] animate-pulse-claude" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="h-16 rounded-xl bg-[#F1F1F0] animate-pulse-claude" />
                  <div className="h-16 rounded-xl bg-[#F1F1F0] animate-pulse-claude" />
                  <div className="h-16 rounded-xl bg-[#F1F1F0] animate-pulse-claude" />
                  <div className="h-16 rounded-xl bg-[#F1F1F0] animate-pulse-claude" />
                </div>
              </div>

              {/* 基础输入（视频标题与账号） */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="h-9 rounded-lg bg-[#F1F1F0] animate-pulse-claude" />
                  <div className="h-9 rounded-lg bg-[#F1F1F0] animate-pulse-claude" />
                </div>
                <div className="h-9 rounded-lg bg-[#F1F1F0] animate-pulse-claude" />
              </div>

              {/* 导粉话术 */}
              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-[#F1F1F0] animate-pulse-claude" />
                <div className="h-14 rounded-lg bg-[#F1F1F0] animate-pulse-claude" />
              </div>

              {/* 提交按钮 */}
              <div className="flex justify-end pt-1">
                <div className="h-9 w-36 rounded-xl bg-[#D97757]/20 animate-pulse-claude" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
