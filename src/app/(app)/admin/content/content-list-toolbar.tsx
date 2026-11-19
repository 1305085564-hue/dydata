"use client";

import { Loader2 } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ContentListProps } from "@/lib/content/domain/content-list";
import type { ContentListState } from "@/lib/content/domain/content-list-state";
import { MemberSelect } from "./member-select";
import { ExpandableSearch } from "./expandable-search";
import { ContentListMoreFilters } from "./content-list-more-filters";
import {
  CONTENT_SEGMENTS,
  activeSegmentOf,
  segmentCountText,
  segmentFilterPatch,
  type ContentSegmentCounts,
} from "./content-segments";

export type ContentListToolbarProps = Pick<ContentListProps, "view" | "onViewChange" | "canManageVideos" | "isViewLoading" | "profiles"> &
  ContentListState & {
    segmentCounts: ContentSegmentCounts | null;
  };

const QUIET_BUTTON =
  "inline-flex h-7 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-md px-2 text-[14px] transition-colors duration-150 cursor-pointer";

/**
 * 数据复盘工具栏：一排，和协作管理同一套语言。
 * 左：分段（全部 · 优 · 良 · 普 · 未评级 · 异常），每段带篇数，点一下只看这些。
 * 右：负责人 · 搜索 · 更多筛选 · 重置 ｜ 互动明细 · 归档。
 * 日期不在这里——日期就是页头标题本身。
 */
export function ContentListToolbar(props: ContentListToolbarProps) {
  const {
    view = "all",
    onViewChange,
    canManageVideos,
    isViewLoading = false,
    profiles,
    filters,
    updateFilter,
    applyFilterPatch,
    profileLabel,
    hasActiveFilters,
    handleResetFilters,
    metricViewMode,
    setMetricViewMode,
    segmentCounts,
  } = props;
  const activeSegment = activeSegmentOf(filters);
  // 未评级、异常没有作品时不占位；正处于该段时保留，好让人点回「全部」
  const segments = CONTENT_SEGMENTS.filter((segment) => {
    if (segment.key !== "unrated" && segment.key !== "anomaly") return true;
    return activeSegment === segment.key || (segmentCounts?.[segment.key] ?? 0) > 0;
  });
  const loadingLabel = isViewLoading ? `正在加载${view === "trash" ? "归档" : "全部作品"}…` : null;

  return (
    <div className="sticky top-[calc(var(--app-top-offset,64px)+0.5rem)] z-20 flex w-full flex-wrap items-center gap-x-3 gap-y-2 bg-[#FCFCFB] py-1">
      {view === "all" ? (
        <div role="tablist" aria-label="按评级或异常查看" className="flex flex-wrap items-center gap-1">
          {segments.map((segment) => {
            const active = activeSegment === segment.key;
            const count = segmentCountText(segment.key, segmentCounts);
            const button = (
              <button
                key={segment.key}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={isViewLoading}
                onClick={() => applyFilterPatch(segmentFilterPatch(segment.key))}
                className={cn(
                  QUIET_BUTTON,
                  "px-3",
                  active ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
                  isViewLoading && "cursor-wait",
                )}
              >
                {segment.label}
                {count !== null && (
                  <span className={cn("ml-1 tabular-nums", active ? "text-[#78716C]" : "text-[#A8A29E]")}>{count}</span>
                )}
              </button>
            );
            return segment.tip ? (
              <SimpleTooltip key={segment.key} tip={segment.tip} side="bottom" align="start">{button}</SimpleTooltip>
            ) : button;
          })}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onViewChange?.("all")}
          disabled={isViewLoading}
          aria-pressed={false}
          className={cn(QUIET_BUTTON, "text-[#1F1E1D] hover:bg-[#EBEBE9]", isViewLoading && "cursor-wait")}
        >
          ← 返回全部作品
        </button>
      )}

      {loadingLabel && (
        <span role="status" aria-busy="true" className="inline-flex items-center gap-1 text-[12px] text-[#78716C]">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {loadingLabel}
        </span>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-1">
        <MemberSelect
          value={filters.userId}
          onChange={(value) => updateFilter("userId", value)}
          profiles={profiles}
          label={profileLabel}
        />
        <ExpandableSearch value={filters.keyword} onChange={(value) => updateFilter("keyword", value)} placeholder="搜索标题/文案…" />
        {view === "all" && <ContentListMoreFilters {...props} />}
        {hasActiveFilters && (
          <button type="button" onClick={handleResetFilters} className={cn(QUIET_BUTTON, "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#1F1E1D]")}>
            重置
          </button>
        )}

        <span className="mx-1 hidden h-4 w-px bg-[#E2E2DF] sm:block" aria-hidden="true" />

        {view === "all" && (
          <SimpleTooltip tip="显示点赞、评论、分享、收藏四列" side="bottom" align="end">
            <button
              type="button"
              aria-pressed={metricViewMode === "full"}
              onClick={() => setMetricViewMode(metricViewMode === "full" ? "spacious" : "full")}
              className={cn(
                QUIET_BUTTON,
                "hidden md:inline-flex",
                metricViewMode === "full" ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
              )}
            >
              互动明细
            </button>
          </SimpleTooltip>
        )}
        {canManageVideos && view === "all" && (
          <button
            type="button"
            onClick={() => onViewChange?.("trash")}
            disabled={isViewLoading}
            aria-pressed={false}
            className={cn(QUIET_BUTTON, "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]", isViewLoading && "cursor-wait")}
          >
            归档
          </button>
        )}
      </div>
    </div>
  );
}
