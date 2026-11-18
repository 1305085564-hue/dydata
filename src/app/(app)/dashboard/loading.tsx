/**
 * 工作台加载骨架：和真实页面同一套单栏结构、同样的尺寸，
 * 内容出来时只是把灰块换成字，整页不重排。
 * 结构对照：页头（状态句 + 本月账 / 两个入口）→ 截图区 136px → 步骤行 → 吸底提交行。
 */
export default function DashboardLoading() {
  const block = "rounded-md bg-[#F1F1F0] animate-pulse-claude";
  return (
    <div className="max-w-5xl mx-auto space-y-5" aria-busy="true" aria-label="工作台加载中">
      {/* 页头：状态句 + 副行；右侧两个入口 */}
      <div className="px-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className={`h-6 w-40 sm:h-[34px] sm:w-52 ${block}`} />
            {/* 副行是带上下内边距和边框的月历按钮，实高约 29px */}
            <div className={`h-[29px] w-72 ${block}`} />
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-7 w-24 ${block}`} />
            <div className={`h-7 w-24 ${block}`} />
          </div>
        </div>
      </div>

      {/* 表单：截图区 → 步骤行 → 提交行 */}
      <div className="max-w-3xl space-y-5">
        <div className="space-y-2">
          <div className="h-[136px] rounded-xl border border-dashed border-[#E2E2DF] bg-[#F7F7F6] animate-pulse-claude" />
          <div className="flex h-6 items-center px-2">
            <div className={`h-3 w-72 ${block}`} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[#E2E2DF] px-2 py-3">
          <div className={`h-10 w-24 ${block}`} />
        </div>
      </div>
    </div>
  );
}
