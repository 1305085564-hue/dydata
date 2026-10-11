import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import type { ContentListState } from "@/lib/content/domain/content-list-state";

type ContentListViewControlsProps = Pick<ContentListProps, "view" | "onViewChange" | "canManageVideos" | "onDirectReview" | "isViewLoading"> &
  Pick<ContentListState, "metricViewMode" | "setMetricViewMode" | "filters" | "toggleOnlyAnomaly" | "anomalyCountForTime">;

export function ContentListViewControls({
  view,
  onViewChange,
  canManageVideos,
  onDirectReview,
  isViewLoading = false,
  metricViewMode,
  setMetricViewMode,
  filters,
  toggleOnlyAnomaly,
  anomalyCountForTime,
}: ContentListViewControlsProps) {
  // 切换期间：明确写出「正在加载归档/全部」，让用户知道在等什么
  // （2026-10-11 审计 H2：实测切换归档要 11.7 秒且全程零反馈，用户会以为点了没反应而反复点）
  const loadingLabel = isViewLoading ? `正在加载${view === "trash" ? "归档" : "全部"}…` : null;
  return (
        <div className="flex items-center gap-2 flex-wrap">
          {/* 1. 视图切换 Tab */}
          <div
            className="inline-flex min-h-[44px] sm:min-h-0 sm:h-7 items-center rounded-md bg-[#F1F1F0] p-0.5 select-none"
            aria-busy={isViewLoading || undefined}
          >
            <button
              type="button"
              onClick={() => onViewChange?.("all")}
              disabled={isViewLoading}
              aria-pressed={view === "all"}
              className={cn(
                "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-6 items-center justify-center rounded-md px-3 sm:px-2.5 text-[13px] transition-all cursor-pointer",
                isViewLoading && "cursor-wait",
                view === "all"
                  ? "bg-white text-[#141413] font-medium shadow-input"
                  : "text-[#78716C] font-normal hover:text-[#141413]"
              )}
            >
              全部
            </button>
            {canManageVideos && (
              <button
                type="button"
                onClick={() => onViewChange?.("trash")}
                disabled={isViewLoading}
                aria-pressed={view === "trash"}
                className={cn(
                  "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-6 items-center justify-center rounded-md px-3 sm:px-2.5 text-[13px] transition-all cursor-pointer",
                  isViewLoading && "cursor-wait",
                  view === "trash"
                    ? "bg-white text-[#141413] font-medium shadow-input"
                    : "text-[#78716C] font-normal hover:text-[#141413]"
                )}
              >
                归档
              </button>
            )}
            {loadingLabel && (
              <span
                role="status"
                className="inline-flex items-center gap-1 pl-2 pr-1.5 text-[12px] font-normal text-[#78716C]"
              >
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {loadingLabel}
              </span>
            )}
          </div>

          {/* 2. 分隔线 (当在正常全量视图时) */}
          {view === "all" && <div className="hidden sm:block h-4 w-px bg-[#E2E2DF] mx-0.5" />}

          {/* 3. 异常快捷开关 (仅在正常全部视图下呈现) */}
          {view === "all" && (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={toggleOnlyAnomaly}
                className={cn(
                  "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-center gap-1 rounded-md px-3 sm:px-2.5 text-[13px] transition-all cursor-pointer select-none",
                  filters.onlyAnomaly
                    ? "bg-status-danger/10 border border-status-danger/30 text-status-danger font-medium shadow-input"
                    : anomalyCountForTime > 0
                      ? "border border-[#E2E2DF] bg-white text-[#1F1E1D] hover:border-[#78716C]/40 shadow-input"
                      : "border border-[#E2E2DF] bg-white text-[#78716C] hover:text-[#141413] shadow-input"
                )}
                title={filters.onlyAnomaly ? "点击恢复显示当前时间段所有作品" : "点击仅看异常作品（按当前时间范围实时统计）"}
              >
                <span>异常</span>
                {anomalyCountForTime > 0 && (
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-md text-[12px] tabular-nums font-normal",
                      filters.onlyAnomaly
                        ? "bg-status-danger/15 text-status-danger"
                        : "bg-status-danger/10 text-status-danger"
                    )}
                  >
                    {anomalyCountForTime}
                  </span>
                )}
              </button>

              {anomalyCountForTime > 0 && onDirectReview && (
                <button
                  type="button"
                  onClick={onDirectReview}
                  title="直接打开当前时间范围内最需关注的异常视频"
                  className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center text-[12px] text-[#78716C] hover:text-[#141413] px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                >
                  去盘 →
                </button>
              )}
            </div>
          )}

          {/* 4. 指标视图切换（完整 / 宽松） - 仅在桌面及平板展示，手机卡片自适应 */}
          {view === "all" && (
            <div className="hidden md:flex items-center gap-0.5 bg-[#F1F1F0] p-0.5 rounded-md text-[12px] select-none ml-1">
              <button
                type="button"
                onClick={() => setMetricViewMode("full")}
                className={cn(
                  "px-2.5 h-6 flex items-center justify-center rounded text-[12px] transition-all cursor-pointer",
                  metricViewMode === "full"
                    ? "bg-white text-[#141413] font-medium shadow-input"
                    : "text-[#78716C] hover:text-[#1F1E1D]"
                )}
              >完整</button>
              <button
                type="button"
                onClick={() => setMetricViewMode("spacious")}
                className={cn(
                  "px-2.5 h-6 flex items-center justify-center rounded text-[12px] transition-all cursor-pointer",
                  metricViewMode === "spacious"
                    ? "bg-white text-[#141413] font-medium shadow-input"
                    : "text-[#78716C] hover:text-[#1F1E1D]"
                )}
              >宽松</button>
            </div>
          )}
        </div>

  );
}
