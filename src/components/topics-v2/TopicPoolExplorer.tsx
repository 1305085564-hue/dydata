"use client";

import React, { useState } from "react";
import { hasRealActiveFilters as hasActivePoolFilters, DEFAULT_MORE_FILTERS } from "@/lib/topics/domain/pool-view";
import type { TopicPoolExplorerProps } from "@/lib/topics/domain/pool-view";
import { PoolToolbar } from "./pool/PoolToolbar";
import { PoolContent } from "./pool/PoolContent";
import { PoolPagination } from "./pool/PoolPagination";

export type { SortByOption, TopicPoolExplorerProps } from "@/lib/topics/domain/pool-view";

export function TopicPoolExplorer({
  items,
  topics,
  loading,
  error,
  totalCount,
  searchQuery,
  currentPage,
  currentView,
  currentTimeRange,
  selectedTopicIds,
  moreFilters,
  sortBy,
  onPageChange,
  onViewChange,
  onTimeRangeChange,
  onTopicIdsChange,
  onMoreFiltersChange,
  onOpenMoreFilters,
  onSortByChange,
  onSearchQueryChange,
  onRetry,
  onGoToFeishu,
  onSelectTopic,
  onCreateClick,
}: TopicPoolExplorerProps) {
  const [displayMode, setDisplayMode] = useState<"grid" | "table">("grid");

  // 仅在有时间、搜索、来源、近7天热度、时长、历史成绩等额外筛选激活时显示已选标签条（母题直接由上方横栏高亮承载，不在此处重复堆叠）
  const hasRealActiveFilters = hasActivePoolFilters(
    currentTimeRange,
    searchQuery,
    moreFilters,
  );

  const handleClearAllFilters = () => {
    onTopicIdsChange([]);
    onTimeRangeChange("all");
    onSearchQueryChange("");
    onMoreFiltersChange({ ...DEFAULT_MORE_FILTERS });
  };

  // 分页滑动窗口：每页 50 条，最多展示 5 个页码并围绕当前页滚动，首/尾贴边不越界。
  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageWindowSize = Math.min(5, totalPages);
  const windowStart = Math.max(
    1,
    Math.min(
      currentPage - Math.floor(pageWindowSize / 2),
      totalPages - pageWindowSize + 1,
    ),
  );
  const pageWindow = Array.from(
    { length: pageWindowSize },
    (_, i) => windowStart + i,
  );

  return (
    <section
      id="topic-pool-explorer"
      className="space-y-4"
      aria-label="干货选题大盘"
    >
      <PoolToolbar
        topics={topics}
        loading={loading}
        totalCount={totalCount}
        searchQuery={searchQuery}
        currentView={currentView}
        currentTimeRange={currentTimeRange}
        selectedTopicIds={selectedTopicIds}
        moreFilters={moreFilters}
        sortBy={sortBy}
        onViewChange={onViewChange}
        onTimeRangeChange={onTimeRangeChange}
        onTopicIdsChange={onTopicIdsChange}
        onMoreFiltersChange={onMoreFiltersChange}
        onOpenMoreFilters={onOpenMoreFilters}
        onSortByChange={onSortByChange}
        onSearchQueryChange={onSearchQueryChange}
        onCreateClick={onCreateClick}
        displayMode={displayMode}
        onToggleDisplayMode={() => setDisplayMode(displayMode === "grid" ? "table" : "grid")}
        hasRealActiveFilters={hasRealActiveFilters}
        onClearAllFilters={handleClearAllFilters}
      />
      <PoolContent
        items={items}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onGoToFeishu={onGoToFeishu}
        onSelectTopic={onSelectTopic}
        displayMode={displayMode}
        hasRealActiveFilters={hasRealActiveFilters}
        onClearAllFilters={handleClearAllFilters}
      />
      <PoolPagination
        loading={loading}
        totalCount={totalCount}
        items={items}
        currentPage={currentPage}
        pageWindow={pageWindow}
        onPageChange={onPageChange}
      />
    </section>
  );
}
