import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import type { ContentListState } from "@/lib/content/domain/content-list-state";

type ContentListViewControlsProps = Pick<ContentListProps, "view" | "onViewChange" | "canManageVideos" | "isViewLoading"> &
  Pick<ContentListState, "metricViewMode" | "setMetricViewMode" | "filters" | "toggleOnlyAnomaly" | "anomalyCountForTime"> & {
    className?: string;
  };

export function ContentListViewControls({
  view,
  onViewChange,
  canManageVideos,
  isViewLoading = false,
  metricViewMode,
  setMetricViewMode,
  filters,
  toggleOnlyAnomaly,
  anomalyCountForTime,
  className,
}: ContentListViewControlsProps) {
  // 切换期间：明确写出「正在加载归档/全部」，让用户知道在等什么
  // （2026-10-11 审计 H2：实测切换归档要 11.7 秒且全程零反馈，用户会以为点了没反应而反复点）
  const loadingLabel = isViewLoading ? `正在加载${view === "trash" ? "归档" : "全部"}…` : null;
  return (
        <div className={cn("flex items-center gap-2 flex-wrap", className)}>
          {/* 1. 视图切换 Tab */}
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onViewChange?.("all")}
              disabled={isViewLoading}
              aria-pressed={view === "all"}
              className={cn(
                "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-center rounded-md px-3 sm:px-2.5 text-[14px] transition-colors cursor-pointer",
                isViewLoading && "cursor-wait",
                view === "all"
                  ? "bg-[#F1F1F0] text-[#141413]"
                  : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]"
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
                  "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-center rounded-md px-3 sm:px-2.5 text-[14px] transition-colors cursor-pointer",
                  isViewLoading && "cursor-wait",
                  view === "trash"
                    ? "bg-[#F1F1F0] text-[#141413]"
                    : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]"
                )}
              >
                归档
              </button>
            )}
            {loadingLabel && (
              <span
                role="status"
                aria-busy="true"
                className="inline-flex items-center gap-1 pl-2 pr-1.5 text-[12px] font-normal text-[#78716C]"
              >
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {loadingLabel}
              </span>
            )}
          </div>

          {/* 2. 指标视图切换（完整 / 宽松） - 仅在桌面及平板展示，手机卡片自适应 */}
          {view === "all" && (
            <div className="hidden md:flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMetricViewMode("full")}
                disabled={isViewLoading}
                aria-pressed={metricViewMode === "full"}
                className={cn(
                  "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-center rounded-md px-3 sm:px-2.5 text-[12px] transition-colors cursor-pointer",
                  isViewLoading && "cursor-wait",
                  metricViewMode === "full"
                    ? "bg-[#F1F1F0] text-[#141413]"
                    : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]"
                )}
              >完整</button>
              <button
                type="button"
                onClick={() => setMetricViewMode("spacious")}
                disabled={isViewLoading}
                aria-pressed={metricViewMode === "spacious"}
                className={cn(
                  "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-center rounded-md px-3 sm:px-2.5 text-[12px] transition-colors cursor-pointer",
                  isViewLoading && "cursor-wait",
                  metricViewMode === "spacious"
                    ? "bg-[#F1F1F0] text-[#141413]"
                    : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]"
                )}
              >宽松</button>
            </div>
          )}

          {/* 3. 分隔线 & 单一纯过滤开关：只看异常 (N)（异常数为 0 且未激活时隐藏） */}
          {view === "all" && (anomalyCountForTime > 0 || filters.onlyAnomaly) && (
            <>
              <div className="hidden sm:block h-4 w-px bg-[#E2E2DF] mx-0.5" />
              <button
                type="button"
                onClick={toggleOnlyAnomaly}
                aria-pressed={filters.onlyAnomaly}
                className={cn(
                  "inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-7 items-center justify-center gap-1 rounded-md px-3 sm:px-2.5 text-[14px] tabular-nums transition cursor-pointer select-none",
                  filters.onlyAnomaly
                    ? "bg-status-danger/10 border border-status-danger/30 text-status-danger shadow-input"
                    : "border border-[#E2E2DF] bg-white text-[#1F1E1D] hover:border-[#78716C]/40 shadow-input"
                )}
                title={filters.onlyAnomaly ? "点击取消仅看异常" : "点击仅看异常作品（删稿 / 限流 / 异常）"}
              >
                <span>只看异常 ({anomalyCountForTime})</span>
              </button>
            </>
          )}
        </div>

  );
}
