import { Card, CardContent } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-3 sm:space-y-4 antialiased">
      {/* 顶部控制栏骨架：创作立卷 · 表达纪事 */}
      <div className="rounded-2xl border border-[#ECE7DE] bg-gradient-to-br from-white via-white to-[#FAF8F4] px-4 py-3 sm:px-6 sm:py-3.5 shadow-card-ring">
        <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* 左侧：标题与副标 */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D97757]" />
              <div className="h-7 w-48 rounded-md bg-[#F5F3EE] animate-pulse-claude" />
            </div>
            <div className="h-4 w-64 rounded bg-[#F5F3EE] animate-pulse-claude" />
          </div>

          {/* 右侧：控制区按键 */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <div className="h-7 w-28 rounded-md bg-[#F5F3EE] animate-pulse-claude" />
            <div className="h-7 w-20 rounded-md bg-[#F5F3EE] animate-pulse-claude" />
            <div className="h-7 w-20 rounded-md bg-[#F5F3EE] animate-pulse-claude" />
          </div>
        </div>
      </div>

      {/* 主工作台卡片：双列布局骨架 */}
      <Card className="rounded-2xl border border-[#ECE7DE] bg-white shadow-card-ring">
        <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5 py-0">
            {/* 头部：标题与状态 */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 sm:pb-4 border-b border-[#ECE7DE]">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="h-5 w-36 rounded bg-[#F5F3EE] animate-pulse-claude" />
                <div className="h-6 w-24 rounded-full bg-[#F5F3EE] animate-pulse-claude" />
              </div>
              <div className="h-4 w-20 rounded bg-[#F5F3EE] animate-pulse-claude" />
            </div>

            {/* 双列网格：左侧截图/伙伴 + 右侧数据表单 */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)] lg:gap-5 items-stretch">
              {/* 左栏：截图槽位 + 共创伙伴 */}
              <div className="flex min-w-0 flex-col gap-3 lg:h-full lg:gap-6">
                {/* 截图槽位 */}
                <div className="space-y-2">
                  <div className="h-4 w-20 rounded bg-[#F5F3EE] animate-pulse-claude" />
                  <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-2.5">
                    <div className="h-28 rounded-xl border border-dashed border-[#ECE7DE] bg-[#FAF8F4]/50 animate-pulse-claude" />
                    <div className="h-28 rounded-xl border border-dashed border-[#ECE7DE] bg-[#FAF8F4]/50 animate-pulse-claude" />
                    <div className="h-28 rounded-xl border border-dashed border-[#ECE7DE] bg-[#FAF8F4]/50 animate-pulse-claude" />
                  </div>
                </div>

                {/* 共创伙伴 */}
                <div className="space-y-2.5 rounded-xl border border-[#ECE7DE] bg-white/90 p-3 shadow-2xs lg:flex-1">
                  <div className="h-4 w-16 rounded bg-[#F5F3EE] animate-pulse-claude" />
                  <div className="space-y-1.5">
                    <div className="h-8 rounded-lg bg-[#FAF8F4] border border-[#ECE7DE]/60 animate-pulse-claude" />
                    <div className="h-8 rounded-lg bg-[#FAF8F4] border border-[#ECE7DE]/60 animate-pulse-claude" />
                    <div className="h-8 rounded-lg bg-[#FAF8F4] border border-[#ECE7DE]/60 animate-pulse-claude" />
                  </div>
                </div>
              </div>

              {/* 右栏：基础信息 + 核心指标 + 导粉话术 + 提交 */}
              <div className="flex min-w-0 flex-col gap-4">
                {/* 基础输入 */}
                <div className="space-y-3 rounded-xl border border-[#ECE7DE] bg-[#FAF8F4]/30 p-3.5 sm:p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="h-9 rounded-lg bg-white border border-[#E5E0D6] animate-pulse-claude" />
                    <div className="h-9 rounded-lg bg-white border border-[#E5E0D6] animate-pulse-claude" />
                  </div>
                  <div className="h-9 rounded-lg bg-white border border-[#E5E0D6] animate-pulse-claude" />
                </div>

                {/* 核心指标 */}
                <div className="space-y-3 rounded-xl border border-[#ECE7DE] bg-white p-3.5 sm:p-4 shadow-2xs">
                  <div className="h-4 w-24 rounded bg-[#F5F3EE] animate-pulse-claude" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="h-16 rounded-xl bg-[#F5F3EE] animate-pulse-claude" />
                    <div className="h-16 rounded-xl bg-[#F5F3EE] animate-pulse-claude" />
                    <div className="h-16 rounded-xl bg-[#F5F3EE] animate-pulse-claude" />
                    <div className="h-16 rounded-xl bg-[#F5F3EE] animate-pulse-claude" />
                  </div>
                </div>

                {/* 导粉话术 */}
                <div className="rounded-xl border border-[#ECE7DE] bg-white p-3.5 sm:p-4 shadow-2xs">
                  <div className="h-4 w-24 rounded bg-[#F5F3EE] animate-pulse-claude mb-2" />
                  <div className="h-14 rounded-lg bg-[#FAF8F4] border border-[#E5E0D6] animate-pulse-claude" />
                </div>

                {/* 提交按钮 */}
                <div className="flex justify-end pt-1">
                  <div className="h-9 w-36 rounded-xl bg-[#D97757]/20 animate-pulse-claude" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
