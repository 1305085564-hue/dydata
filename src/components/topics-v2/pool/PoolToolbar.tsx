"use client";

import React from "react";
import { ChevronDown, Search, LayoutGrid, List, X, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import type { TopicTimeRange } from "../types";
import {
  durationLabel,
  getSortByLabel,
  getTimeRangeLabel,
  performanceLabel,
  recentHeatLabel,
  sourceTypeLabel,
} from "@/lib/topics/domain/pool-view";
import type { SortByOption, TopicPoolExplorerProps } from "@/lib/topics/domain/pool-view";

export type PoolToolbarProps = Pick<
  TopicPoolExplorerProps,
  | "topics"
  | "loading"
  | "totalCount"
  | "searchQuery"
  | "currentView"
  | "currentTimeRange"
  | "selectedTopicIds"
  | "moreFilters"
  | "sortBy"
  | "onViewChange"
  | "onTimeRangeChange"
  | "onTopicIdsChange"
  | "onMoreFiltersChange"
  | "onOpenMoreFilters"
  | "onSortByChange"
  | "onSearchQueryChange"
  | "onCreateClick"
> & {
  displayMode: "grid" | "table";
  onToggleDisplayMode: () => void;
  hasRealActiveFilters: boolean;
  onClearAllFilters: () => void;
};

export function PoolToolbar({
  topics,
  loading,
  totalCount,
  searchQuery,
  currentView,
  currentTimeRange,
  selectedTopicIds,
  moreFilters,
  sortBy,
  onViewChange,
  onTimeRangeChange,
  onTopicIdsChange,
  onMoreFiltersChange,
  onOpenMoreFilters,
  onSortByChange,
  onSearchQueryChange,
  onCreateClick,
  displayMode,
  onToggleDisplayMode,
  hasRealActiveFilters,
  onClearAllFilters,
}: PoolToolbarProps) {
  // 多选母题勾选切换
  const toggleTopicId = (id: string) => {
    if (selectedTopicIds.includes(id)) {
      onTopicIdsChange(selectedTopicIds.filter((tId) => tId !== id));
    } else {
      onTopicIdsChange([...selectedTopicIds, id]);
    }
  };

  return (
    <>
      {/* 顶栏控制中枢：顶部保留充裕气口，底部收紧与母题标签的距离 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2.5 pb-1 sm:pt-3 sm:pb-1.5">
        {/* 左侧：Tab 视角切换 */}
        <div className="inline-flex items-center gap-1 bg-[#F1F1F0] p-0.5 rounded-md select-none shrink-0 border border-[#E2E2DF]/60">
          <button
            type="button"
            onClick={() => onViewChange("all")}
            className={`px-3 py-1 h-7 rounded-md text-[12px] font-normal transition-all flex items-center gap-1 cursor-pointer active:scale-[0.99] active:duration-120 ${
              currentView === "all"
                ? "bg-white text-[#141413] font-normal shadow-input"
                : "text-[#78716C] hover:text-[#141413] hover:bg-white/60 font-normal"
            }`}
          >
            <span>全部选题</span>
            {!loading && totalCount > 0 && (
              <span
                className={`text-[12px] tabular-nums ${
                  currentView === "all"
                    ? "text-[#D97757] font-normal"
                    : "text-[#78716C] font-normal"
                }`}
              >
                {totalCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onViewChange("my_created")}
            className={`px-3 py-1 h-7 rounded-md text-[12px] font-normal transition-all cursor-pointer flex items-center justify-center active:scale-[0.99] active:duration-120 ${
              currentView === "my_created"
                ? "bg-white text-[#141413] font-normal shadow-input"
                : "text-[#78716C] hover:text-[#141413] hover:bg-[#E2E2DF]/50 font-normal"
            }`}
          >
            我的选题
          </button>
          <button
            type="button"
            onClick={() => onViewChange("my_claims")}
            className={`px-3 py-1 h-7 rounded-md text-[12px] font-normal transition-all cursor-pointer flex items-center justify-center active:scale-[0.99] active:duration-120 ${
              currentView === "my_claims"
                ? "bg-white text-[#141413] font-normal shadow-input"
                : "text-[#78716C] hover:text-[#141413] hover:bg-[#E2E2DF]/50 font-normal"
            }`}
          >
            在写选题
          </button>
        </div>

        {/* 右侧：搜索、母题、排序、时间、更多、视图切换与操作 */}
        <FilterBar className="gap-1 sm:gap-2">
          {/* 1. 搜索框：恢复线上标准边框与色深 */}
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="搜索选题/Hook..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="text-[12px] bg-white/70 border border-[#E2E2DF] shadow-input hover:border-[#78716C]/40 focus-visible:bg-white focus-visible:border-[#141413] rounded-md pl-7 pr-2.5 h-7 w-28 focus-visible:w-44 sm:w-36 sm:focus-visible:w-48 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10 text-[#1F1E1D] placeholder:text-[#A8A29E] font-normal transition-all"
              aria-label="搜索选题"
            />
            <Search className="w-3.5 h-3.5 text-[#78716C] absolute left-2 pointer-events-none" />
          </div>

          {/* 2. 排序下拉：恢复线上标准 text-[#1F1E1D] */}
          <div className="relative inline-flex items-center">
            <Select
              value={sortBy}
              onValueChange={(val) => onSortByChange(val as SortByOption)}
            >
              <SelectTrigger
                aria-label="排序依据"
                className="h-7 rounded-md border-0 bg-transparent px-2 text-[12px] text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413] font-normal shadow-none transition-colors"
              >
                <SelectValue>
                  {getSortByLabel(sortBy)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-[#E2E2DF] shadow-claude-float min-w-28">
                <SelectItem value="latest">最新</SelectItem>
                <SelectItem value="best_play">最高播放</SelectItem>
                <SelectItem value="avg_play">均播</SelectItem>
                <SelectItem value="recent_heat">7天热度</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 4. 时间下拉：恢复线上标准 text-[#1F1E1D] */}
          <Select
            value={currentTimeRange}
            onValueChange={(val) => onTimeRangeChange(val as TopicTimeRange)}
          >
            <SelectTrigger
              aria-label="时间范围"
              className={`h-7 rounded-md border-0 bg-transparent px-2 text-[12px] transition-colors shadow-none ${
                currentTimeRange !== "all"
                  ? "font-normal text-[#141413] bg-[#F1F1F0]"
                  : "font-normal text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413]"
              }`}
            >
              <SelectValue>
                {currentTimeRange === "all"
                  ? "时间"
                  : getTimeRangeLabel(currentTimeRange)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-[#E2E2DF] shadow-claude-float min-w-28 max-h-[calc(100dvh-var(--app-top-offset,64px)-1rem)] overflow-y-auto">
              <SelectItem value="all">全部时间</SelectItem>
              <SelectItem value="3m">近 90 天</SelectItem>
              <SelectItem value="1m">近 30 天</SelectItem>
              <SelectItem value="1w">近 7 天</SelectItem>
              <SelectItem value="3d">近 3 天</SelectItem>
            </SelectContent>
          </Select>

          {/* 5. 更多筛选：纯文字 + 下拉箭头，与最新/时间严格对齐 */}
          <button
            type="button"
            onClick={onOpenMoreFilters}
            className="inline-flex items-center gap-1 px-2 h-7 rounded-md text-[12px] text-[#1F1E1D] hover:text-[#141413] hover:bg-[#EBEBE9] font-normal transition-all active:scale-[0.99] active:duration-120 cursor-pointer"
            aria-label="展开更多筛选"
          >
            <span>更多</span>
            <ChevronDown className="size-3.5 text-[#78716C] opacity-60" />
          </button>

          {/* 呼吸微竖线 */}
          <div
            className="h-4 w-px bg-[#E2E2DF] hidden sm:block mx-0.5 shrink-0"
            aria-hidden="true"
          />

          {/* 6. 单一视图切换按钮：点击切换，划入提示 */}
          <button
            type="button"
            onClick={onToggleDisplayMode}
            className="group relative size-7 inline-flex items-center justify-center rounded-md text-[#1F1E1D] hover:text-[#141413] hover:bg-[#EBEBE9] transition-all active:scale-[0.95] active:duration-120 cursor-pointer"
            title={displayMode === "grid" ? "切换为表格视图" : "切换为卡片视图"}
            aria-label={displayMode === "grid" ? "切换为表格视图" : "切换为卡片视图"}
          >
            {displayMode === "grid" ? (
              <List className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
            ) : (
              <LayoutGrid className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
            )}
          </button>

          {/* 7. 录入选题（全屏唯一主行动 CTA 陶土橙） */}
          {onCreateClick && (
            <Button
              size="sm"
              onClick={onCreateClick}
              aria-label="录入选题"
              className="shrink-0"
            >
              <Plus className="size-3.5 stroke-[2.5]" />
              <span>录入选题</span>
            </Button>
          )}

        </FilterBar>
      </div>

      {/* 标签栏：恢复线上标准色深与清晰度，与上方筛选栏紧密协同 */}
      {topics.length > 0 && (
        <div className="flex items-center gap-4 sm:gap-5 overflow-x-auto no-scrollbar select-none text-[12px] -mx-0.5 px-0.5 -mt-2 sm:-mt-2.5 mb-2 sm:mb-2.5">
          <button
            type="button"
            onClick={() => onTopicIdsChange([])}
            className={`inline-flex items-center pb-1.5 pt-1 text-[12px] transition-colors shrink-0 cursor-pointer ${
              selectedTopicIds.length === 0
                ? "border-b-2 border-[#141413] text-[#141413] font-normal"
                : "bg-transparent text-[#78716C] hover:text-[#141413] font-normal"
            }`}
          >
            <span>全部分类</span>
          </button>
          {topics.map((t) => {
            const isSelected = selectedTopicIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTopicId(t.id)}
                className={`inline-flex items-center pb-1.5 pt-1 text-[12px] transition-colors shrink-0 cursor-pointer ${
                  isSelected
                    ? "border-b-2 border-[#141413] text-[#141413] font-normal"
                    : "bg-transparent text-[#78716C] hover:text-[#141413] font-normal"
                }`}
              >
                <span>{t.name}</span>
              </button>
            );
          })}
          {selectedTopicIds.length > 0 && (
            <button
              type="button"
              onClick={() => onTopicIdsChange([])}
              className="text-[12px] text-[#78716C] hover:text-[#D97757] font-normal pb-1.5 pt-1 ml-auto shrink-0 cursor-pointer transition-colors"
            >
              清空已选
            </button>
          )}
        </div>
      )}

      {/* 已选筛选条件气泡条 (Filter Pills，只展示除母题横栏之外的真实生效项：时间、搜索、更多筛选) */}
      {hasRealActiveFilters && (
        <FilterBar className="pt-0.5 pb-1">
          <span className="text-[12px] text-[#78716C] mr-1">已生效筛选:</span>

          {/* 时间标签 */}
          {currentTimeRange !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-[12px] text-[#1F1E1D] font-normal">
              <span>时间: {getTimeRangeLabel(currentTimeRange)}</span>
              <button
                type="button"
                onClick={() => onTimeRangeChange("all")}
                className="text-[#78716C] hover:text-[#141413] cursor-pointer"
                aria-label="重置时间筛选"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* 搜索词标签 */}
          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-[12px] text-[#1F1E1D] font-normal">
              <span>搜索: “{searchQuery.trim()}”</span>
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="text-[#78716C] hover:text-[#141413] cursor-pointer"
                aria-label="清除搜索词"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* 「更多」高级筛选标签 */}
          {moreFilters.sourceType !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-[12px] text-[#1F1E1D] font-normal">
              <span>{sourceTypeLabel(moreFilters.sourceType)}</span>
              <button
                type="button"
                onClick={() => onMoreFiltersChange({ ...moreFilters, sourceType: "all" })}
                className="text-[#78716C] hover:text-[#141413] cursor-pointer"
                aria-label="移除来源筛选"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {moreFilters.recentHeat !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-[12px] text-[#1F1E1D] font-normal">
              <span>{recentHeatLabel(moreFilters.recentHeat)}</span>
              <button
                type="button"
                onClick={() => onMoreFiltersChange({ ...moreFilters, recentHeat: "all" })}
                className="text-[#78716C] hover:text-[#141413] cursor-pointer"
                aria-label="移除近7天热度筛选"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {moreFilters.durationRange !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-[12px] text-[#1F1E1D] font-normal">
              <span>{durationLabel(moreFilters.durationRange)}</span>
              <button
                type="button"
                onClick={() => onMoreFiltersChange({ ...moreFilters, durationRange: "all" })}
                className="text-[#78716C] hover:text-[#141413] cursor-pointer"
                aria-label="移除时长筛选"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {moreFilters.performanceTier !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-[12px] text-[#1F1E1D] font-normal">
              <span>{performanceLabel(moreFilters.performanceTier)}</span>
              <button
                type="button"
                onClick={() => onMoreFiltersChange({ ...moreFilters, performanceTier: "all" })}
                className="text-[#78716C] hover:text-[#141413] cursor-pointer"
                aria-label="移除历史成绩筛选"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* 一键清空全部 */}
          <button
            type="button"
            onClick={onClearAllFilters}
            className="text-[12px] text-[#D97757] hover:underline font-normal px-1 cursor-pointer"
          >
            清空全部
          </button>
        </FilterBar>
      )}

    </>
  );
}
