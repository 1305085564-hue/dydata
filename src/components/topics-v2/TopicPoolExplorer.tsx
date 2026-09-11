"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  Search,
  LayoutGrid,
  List,
  RefreshCw,
  X,
  CheckCircle2,
  Plus,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type {
  TopicPoolItem,
  TopicOption,
  TopicPoolView,
  TopicTimeRange,
  TopicMoreFiltersState,
} from "./types";
import { DEFAULT_MORE_FILTERS } from "./types";

export type SortByOption =
  | "latest"
  | "avg_play"
  | "best_play"
  | "recent_heat";

export interface TopicPoolExplorerProps {
  items: TopicPoolItem[];
  topics: TopicOption[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  searchQuery: string;
  currentPage: number;
  currentView: TopicPoolView;
  currentTimeRange: TopicTimeRange;
  selectedTopicIds: string[];
  moreFilters: TopicMoreFiltersState;
  sortBy: SortByOption;
  onPageChange: (page: number) => void;
  onViewChange: (view: TopicPoolView) => void;
  onTimeRangeChange: (timeRange: TopicTimeRange) => void;
  onTopicIdsChange: (topicIds: string[]) => void;
  onMoreFiltersChange: (filters: TopicMoreFiltersState) => void;
  onOpenMoreFilters: () => void;
  onSortByChange: (sortBy: SortByOption) => void;
  onSearchQueryChange: (query: string) => void;
  onRetry: () => void;
  onOpenFeishuModal: (topic: TopicPoolItem) => void;
  onSelectTopic: (subTopicId: string) => void;
  onCreateClick?: () => void;
}

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
  onOpenFeishuModal,
  onSelectTopic,
  onCreateClick,
}: TopicPoolExplorerProps) {
  const [displayMode, setDisplayMode] = useState<"grid" | "table">("grid");

  // 多选母题勾选切换
  const toggleTopicId = (id: string) => {
    if (selectedTopicIds.includes(id)) {
      onTopicIdsChange(selectedTopicIds.filter((tId) => tId !== id));
    } else {
      onTopicIdsChange([...selectedTopicIds, id]);
    }
  };

  const getTimeRangeLabel = (range: TopicTimeRange) => {
    switch (range) {
      case "3d":
        return "近 3 天";
      case "1w":
        return "近 7 天";
      case "1m":
        return "近 30 天";
      case "3m":
        return "近 90 天";
      case "all":
      default:
        return "全部时间";
    }
  };

  // 仅在有时间、搜索、来源、近7天热度、时长、历史成绩等额外筛选激活时显示已选标签条（母题直接由上方横栏高亮承载，不在此处重复堆叠）
  const hasRealActiveFilters =
    currentTimeRange !== "all" ||
    searchQuery.trim().length > 0 ||
    moreFilters.sourceType !== "all" ||
    moreFilters.recentHeat !== "all" ||
    moreFilters.durationRange !== "all" ||
    moreFilters.performanceTier !== "all";

  const handleClearAllFilters = () => {
    onTopicIdsChange([]);
    onTimeRangeChange("all");
    onSearchQueryChange("");
    onMoreFiltersChange({ ...DEFAULT_MORE_FILTERS });
  };

  const sourceTypeLabel = (v: TopicMoreFiltersState["sourceType"]) =>
    v === "internal" ? "内部来源" : v === "external" ? "外部来源" : "";
  const recentHeatLabel = (v: TopicMoreFiltersState["recentHeat"]) =>
    v === "has_participants" ? "近7天有参与" : v === "has_completed" ? "近7天有完成" : v === "has_in_progress" ? "近7天有在写" : v === "no_participants" ? "近7天暂无参与" : "";
  const durationLabel = (v: TopicMoreFiltersState["durationRange"]) =>
    v === "under_2m" ? "2分钟内" : v === "2_5m" ? "2-5分钟" : v === "over_5m" ? "5分钟以上" : "";
  const performanceLabel = (v: TopicMoreFiltersState["performanceTier"]) =>
    v === "high_best_play" ? "最高播放≥10万" : v === "high_qualified" ? "有达标作品" : v === "high_avg_play" ? "均播≥3万" : "";

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
      {/* 顶栏控制中枢：去除外层浮岛卡片框，直接平铺裸铺于页面画布上 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 py-1">
        {/* 左侧：Tab 视角切换 */}
        <div className="inline-flex items-center gap-1 bg-[#F1F1F0] p-0.5 rounded-lg select-none shrink-0 border border-[#E2E2DF]/60">
          <button
            type="button"
            onClick={() => onViewChange("all")}
            className={`px-3 py-1 h-7 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.99] active:duration-120 ${
              currentView === "all"
                ? "bg-white text-[#1C1917] font-semibold shadow-2xs"
                : "text-[#78716C] hover:text-[#1C1917] hover:bg-white/60"
            }`}
          >
            <span>全部选题</span>
            {totalCount > 0 && (
              <span
                className={`text-[11px] tabular-nums ${
                  currentView === "all"
                    ? "text-[#D97757] font-semibold"
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
            className={`px-3 py-1 h-7 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center justify-center active:scale-[0.99] active:duration-120 ${
              currentView === "my_created"
                ? "bg-white text-[#1C1917] font-medium shadow-2xs"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#E2E2DF]/50"
            }`}
          >
            我的选题
          </button>
          <button
            type="button"
            onClick={() => onViewChange("my_claims")}
            className={`px-3 py-1 h-7 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center justify-center active:scale-[0.99] active:duration-120 ${
              currentView === "my_claims"
                ? "bg-white text-[#1C1917] font-medium shadow-2xs"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#E2E2DF]/50"
            }`}
          >
            在写选题
          </button>
        </div>

        {/* 右侧：搜索、母题、排序、时间、更多、视图切换与操作 */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* 1. 搜索框：恢复线上标准边框与色深 */}
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="搜索选题/Hook..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="text-xs bg-white/70 border border-[#E2E2DF] shadow-input hover:border-[#78716C]/40 focus-visible:bg-white focus-visible:border-[#78716C] rounded-lg pl-7 pr-2.5 h-7 w-28 focus-visible:w-44 sm:w-36 sm:focus-visible:w-48 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 text-[#292524] placeholder:text-[#78716C]/60 font-normal transition-all"
              aria-label="搜索选题"
            />
            <Search className="w-3.5 h-3.5 text-[#78716C] absolute left-2 pointer-events-none" />
          </div>

          {/* 2. 排序下拉：恢复线上标准 text-[#292524] */}
          <div className="relative inline-flex items-center">
            <Select
              value={sortBy}
              onValueChange={(val) => onSortByChange(val as SortByOption)}
            >
              <SelectTrigger
                aria-label="排序依据"
                className="h-7 rounded-md border-0 bg-transparent px-2 text-xs text-[#292524] hover:bg-[#EBEBE9] hover:text-[#1C1917] font-normal shadow-none transition-colors"
              >
                <SelectValue>
                  {sortBy === "best_play"
                    ? "最高播放"
                    : sortBy === "avg_play"
                      ? "均播"
                      : sortBy === "recent_heat"
                        ? "7天热度"
                        : "最新"}
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

          {/* 4. 时间下拉：恢复线上标准 text-[#292524] */}
          <Select
            value={currentTimeRange}
            onValueChange={(val) => onTimeRangeChange(val as TopicTimeRange)}
          >
            <SelectTrigger
              aria-label="时间范围"
              className={`h-7 rounded-md border-0 bg-transparent px-2 text-xs transition-colors shadow-none ${
                currentTimeRange !== "all"
                  ? "font-semibold text-[#1C1917] bg-[#F1F1F0]"
                  : "font-normal text-[#292524] hover:bg-[#EBEBE9] hover:text-[#1C1917]"
              }`}
            >
              <SelectValue>
                {currentTimeRange === "all"
                  ? "时间"
                  : getTimeRangeLabel(currentTimeRange)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-[#E2E2DF] shadow-claude-float min-w-28">
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
            className="inline-flex items-center gap-1 px-2 h-7 rounded-md text-xs text-[#292524] hover:text-[#1C1917] hover:bg-[#EBEBE9] font-normal transition-all active:scale-[0.99] active:duration-120 cursor-pointer"
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
            onClick={() => setDisplayMode(displayMode === "grid" ? "table" : "grid")}
            className="group relative size-7 inline-flex items-center justify-center rounded-md text-[#292524] hover:text-[#1C1917] hover:bg-[#EBEBE9] transition-all active:scale-[0.95] active:duration-120 cursor-pointer"
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
            <button
              type="button"
              onClick={onCreateClick}
              className="inline-flex items-center gap-1.5 h-7 rounded-md bg-[#D97757] hover:bg-[#C46A4D] px-3.5 text-xs font-semibold text-white shadow-sm transition-all active:scale-[0.99] active:duration-120 cursor-pointer shrink-0"
              aria-label="录入选题"
            >
              <Plus className="size-3.5 stroke-[2.5]" />
              <span>录入选题</span>
            </button>
          )}

        </div>
      </div>

      {/* 标签栏：恢复线上标准色深与清晰度 */}
      {topics.length > 0 && (
        <div className="flex items-center gap-4 sm:gap-5 overflow-x-auto no-scrollbar select-none text-xs -mx-0.5 px-0.5 -mt-1 sm:-mt-1.5 mb-2 sm:mb-2.5">
          <button
            type="button"
            onClick={() => onTopicIdsChange([])}
            className={`inline-flex items-center pb-1.5 pt-1 text-xs transition-colors shrink-0 cursor-pointer ${
              selectedTopicIds.length === 0
                ? "border-b-2 border-[#1C1917] text-[#1C1917] font-semibold"
                : "bg-transparent text-[#292524] hover:text-[#1C1917]"
            }`}
          >
            <span>全部选题</span>
          </button>
          {topics.map((t) => {
            const isSelected = selectedTopicIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTopicId(t.id)}
                className={`inline-flex items-center pb-1.5 pt-1 text-xs transition-colors shrink-0 cursor-pointer ${
                  isSelected
                    ? "border-b-2 border-[#1C1917] text-[#1C1917] font-semibold"
                    : "bg-transparent text-[#292524] hover:text-[#1C1917]"
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
              className="text-[11px] text-[#78716C] hover:text-[#D97757] font-normal pb-1.5 pt-1 ml-auto shrink-0 cursor-pointer transition-colors"
            >
              清空已选
            </button>
          )}
        </div>
      )}

      {/* 已选筛选条件气泡条 (Filter Pills，只展示除母题横栏之外的真实生效项：时间、搜索、更多筛选) */}
      {hasRealActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 pb-1">
          <span className="text-[11.5px] text-[#78716C] mr-1">已生效筛选:</span>

          {/* 时间标签 */}
          {currentTimeRange !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-xs text-[#292524]">
              <span>时间: {getTimeRangeLabel(currentTimeRange)}</span>
              <button
                type="button"
                onClick={() => onTimeRangeChange("all")}
                className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                aria-label="重置时间筛选"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* 搜索词标签 */}
          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-xs text-[#292524]">
              <span>搜索: “{searchQuery.trim()}”</span>
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                aria-label="清除搜索词"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* 「更多」高级筛选标签 */}
          {moreFilters.sourceType !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-xs text-[#292524]">
              <span>{sourceTypeLabel(moreFilters.sourceType)}</span>
              <button
                type="button"
                onClick={() => onMoreFiltersChange({ ...moreFilters, sourceType: "all" })}
                className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                aria-label="移除来源筛选"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {moreFilters.recentHeat !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-xs text-[#292524]">
              <span>{recentHeatLabel(moreFilters.recentHeat)}</span>
              <button
                type="button"
                onClick={() => onMoreFiltersChange({ ...moreFilters, recentHeat: "all" })}
                className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                aria-label="移除近7天热度筛选"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {moreFilters.durationRange !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-xs text-[#292524]">
              <span>{durationLabel(moreFilters.durationRange)}</span>
              <button
                type="button"
                onClick={() => onMoreFiltersChange({ ...moreFilters, durationRange: "all" })}
                className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                aria-label="移除时长筛选"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {moreFilters.performanceTier !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-transparent border border-[#E2E2DF]/60 px-2 py-0.5 text-xs text-[#292524]">
              <span>{performanceLabel(moreFilters.performanceTier)}</span>
              <button
                type="button"
                onClick={() => onMoreFiltersChange({ ...moreFilters, performanceTier: "all" })}
                className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                aria-label="移除历史成绩筛选"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* 一键清空全部 */}
          <button
            type="button"
            onClick={handleClearAllFilters}
            className="text-xs text-[#D97757] hover:underline font-medium px-1 cursor-pointer"
          >
            清空全部
          </button>
        </div>
      )}

      {/* 主展示区 */}
      {loading ? (
        <div className="py-20 text-center">
          <RefreshCw className="w-5 h-5 text-[#78716C] animate-spin mx-auto mb-2" />
          <p className="text-xs text-[#78716C] font-normal">选题库加载中...</p>
        </div>
      ) : error ? (
        <Alert variant="error" className="p-4 sm:p-5">
          <div className="space-y-1">
            <AlertTitle className="text-sm font-medium text-[#1C1917]">
              选题库数据加载失败
            </AlertTitle>
            <AlertDescription className="text-xs text-[#78716C] font-normal">
              {error}
            </AlertDescription>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 h-7 rounded-md bg-white border border-[#E2E2DF] text-xs font-medium text-[#292524] hover:bg-[#EBEBE9] active:scale-[0.99] active:duration-120 transition-all cursor-pointer shrink-0 shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重新加载</span>
          </button>
        </Alert>
      ) : items.length === 0 ? (
        <div className="py-16 px-4 text-center border border-dashed border-[#E2E2DF] rounded-2xl bg-transparent space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#F1F1F0] text-[#A8A29E] flex items-center justify-center mx-auto">
            <Search className="w-5 h-5" />
          </div>
          {hasRealActiveFilters ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-[#1C1917]">
                未找到符合条件的选题
              </h3>
              <p className="text-xs text-[#78716C] max-w-sm mx-auto font-normal leading-relaxed">
                当前筛选组合下暂无匹配的干货选题，可尝试清空或放宽筛选条件
              </p>
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="mt-2 inline-flex items-center gap-1.5 px-3.5 h-7 rounded-md bg-white border border-[#E2E2DF] text-xs font-medium text-[#292524] hover:bg-[#EBEBE9] active:scale-[0.99] active:duration-120 transition-all cursor-pointer shadow-2xs"
              >
                清空当前筛选
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-[#1C1917]">
                干货选题库暂无内容
              </h3>
              <p className="text-xs text-[#78716C] max-w-sm mx-auto font-normal leading-relaxed">
                内部达到 3 万播放的干货视频将自动入库，也可以批量导入或手动录入
              </p>
            </div>
          )}
        </div>
      ) : displayMode === "grid" ? (
        /* V3 卡片网格视图：每行卡片响应式断点 (1列至3列，2xl展现4列，防止1280px下拥挤遮挡按钮) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
          {items.map((item) => {
            const summary = item.summary;
            const isWriting = item.isWritingByMe === true || item.myClaim?.status === "writing";

            // 真实历史数据证明（严禁补造假数据）
            const bestPlay = summary?.bestPlayCount ?? null;
            const qualifiedCount = summary?.qualifiedWorkCount ?? null;
            const participants7d = item.recent7dParticipants ?? null;
            const inProgressCount = item.recent7dInProgressCount ?? null;

            return (
              <div
                key={item.id}
                onClick={() => onSelectTopic(item.id)}
                className="group relative bg-white shadow-card-ring rounded-2xl p-4 hover:shadow-claude-float transition-shadow duration-200 cursor-pointer flex flex-col justify-between min-h-[44px]"
              >
                <div>
                  {/* 顶栏：分类中性印记（无背景色块，无饱和彩点，自然排版） */}
                  <div className="flex items-center justify-between gap-1.5 mb-2 min-w-0">
                    <span className="text-[11.5px] font-medium text-[#78716C] tracking-wide truncate">
                      {item.topics?.name || "常规母题"}
                      {item.topic_groups?.name ? ` · ${item.topic_groups.name}` : ""}
                    </span>

                    {/* 在写状态微标记 */}
                    {isWriting && (
                      <span className="text-[11px] font-medium text-[#6FAA7D] bg-[#6FAA7D]/10 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="size-3" />
                        <span>已在写</span>
                      </span>
                    )}
                  </div>

                  {/* 标题：饱满清晰 */}
                  <h3 className="text-[15px] font-medium text-[#1C1917] group-hover:text-[#D97757] transition-colors line-clamp-2 leading-snug mb-1.5">
                    {item.title}
                  </h3>

                  {/* 一句话 Hook / 立意观点 (纸内纯排版：密集小字 Sans 规范) */}
                  {item.hook && (
                    <p className="text-[12.5px] font-sans text-[#57534E] line-clamp-2 leading-relaxed mb-2.5">
                      <span className="text-[#D97757] font-serif mr-0.5 select-none font-medium">“</span>
                      {item.hook}
                      <span className="text-[#D97757] font-serif ml-0.5 select-none font-medium">”</span>
                    </p>
                  )}
                </div>

                {/* 底栏：单行内联全部数据（最高播放 · 达标作品 · 7天热度）+ 创作行动，右侧操作按钮绝对置顶防遮挡 */}
                <div className="pt-2.5 border-t border-[#E2E2DF]/60 flex items-center justify-between gap-2 mt-auto text-[11.5px] min-w-0">
                  {/* 左侧：数据证明与热度内联，弹性截断不挤压按钮 */}
                  <div className="text-[#78716C] tabular-nums truncate flex items-center gap-1 font-normal min-w-0 flex-1">
                    {/* 尚未选稿状态标签：保留该逻辑，默认状态下 className="hidden"，仅在需要时通过条件渲染显示 */}
                    <span className="hidden text-[#78716C] text-[11.5px]" data-status="unselected">
                      尚未选稿
                    </span>

                    {bestPlay !== null && (
                      <span className="text-[#292524] font-medium shrink-0 tabular-nums">
                        最高 {bestPlay >= 10000 ? `${(bestPlay / 10000).toFixed(1)}万` : bestPlay.toLocaleString()}
                      </span>
                    )}

                    {bestPlay !== null && qualifiedCount !== null && (
                      <span className="text-[#E2E2DF] select-none shrink-0">·</span>
                    )}

                    {qualifiedCount !== null && (
                      <span className="text-[#292524] shrink-0 tabular-nums">
                        {qualifiedCount > 0 ? `${qualifiedCount}条优质` : "尚未达标"}
                      </span>
                    )}

                    {(bestPlay !== null || qualifiedCount !== null) && participants7d !== null && (
                      <span className="text-[#E2E2DF] select-none shrink-0 hidden sm:inline">·</span>
                    )}

                    {participants7d !== null ? (
                      <span className="tabular-nums truncate hidden sm:inline">{participants7d}人参与</span>
                    ) : null}

                    {(inProgressCount ?? 0) > 0 && (
                      <>
                        <span className="text-[#E2E2DF] select-none shrink-0 hidden xl:inline">·</span>
                        <span className="text-[#43718E] font-medium tabular-nums truncate hidden xl:inline">{inProgressCount}人在写</span>
                      </>
                    )}

                    {bestPlay === null && qualifiedCount === null && participants7d === null && (
                      <span className="text-[#A8A29E]">—</span>
                    )}
                  </div>

                  {/* 右侧：操作按钮 (浅砂副行动，与工具栏唯一主 CTA 区分，锁定 shrink-0 与 z-10 防覆盖) */}
                  <div className="shrink-0 relative z-10 min-w-fit">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFeishuModal(item);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-xs font-medium transition-all active:scale-[0.99] active:duration-120 cursor-pointer ${
                        isWriting
                          ? "bg-[#6FAA7D]/10 text-[#6FAA7D] hover:bg-[#6FAA7D]/20"
                          : "bg-[#F1F1F0] text-[#292524] hover:bg-[#EBEBE9]"
                      }`}
                      aria-label="去飞书创作此题"
                    >
                      <span>{isWriting ? "去飞书创作" : "我要写"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 表格视图：发丝细线、无斑马纹、数字右对齐 */
        <div className="overflow-x-auto bg-white shadow-card-ring rounded-xl">
          <table className="w-full min-w-[720px] text-left text-xs border-collapse">
            <thead className="border-b border-[#E2E2DF] text-[11px] font-medium text-[#78716C]">
              <tr>
                <th className="py-2.5 px-3">母题</th>
                <th className="py-2.5 px-3 min-w-[240px]">选题名称</th>
                <th className="py-2.5 px-3 text-right">历史最高播放</th>
                <th className="py-2.5 px-3 text-right">优质作品数</th>
                <th className="py-2.5 px-3">近 7 天热度</th>
                <th className="py-2.5 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E2DF] bg-white">
              {items.map((item) => {
                const summary = item.summary;
                const isWriting = item.isWritingByMe === true || item.myClaim?.status === "writing";

                const bestPlay = summary?.bestPlayCount ?? null;
                const qualifiedCount = summary?.qualifiedWorkCount ?? null;
                const participants7d = item.recent7dParticipants ?? null;

                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectTopic(item.id)}
                    className="group hover:bg-[#F7F7F6] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-3 text-[#57534E] font-normal whitespace-nowrap">
                      {item.topics?.name || "常规母题"}
                    </td>
                    <td className="py-3 px-3 max-w-sm">
                      <div className="text-[13.5px] font-medium text-[#1C1917] group-hover:text-[#D97757] truncate">
                        {item.title}
                      </div>
                      {item.hook && (
                        <div className="text-[11.5px] text-[#78716C] truncate mt-0.5 font-sans">
                          “{item.hook}”
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums font-medium text-[#1C1917]">
                      {bestPlay !== null
                        ? bestPlay >= 10000
                          ? `${(bestPlay / 10000).toFixed(1)}万`
                          : bestPlay.toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#292524]">
                      {qualifiedCount !== null ? `${qualifiedCount} 条` : "—"}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-[#78716C]">
                      <span className="tabular-nums">近 7 天 {participants7d !== null ? `${participants7d} 人参与` : "—"}</span>
                      {(item.recent7dInProgressCount ?? 0) > 0 && (
                        <span className="text-[#43718E] ml-1 tabular-nums">
                          ({item.recent7dInProgressCount}人在写)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenFeishuModal(item);
                        }}
                        className={`px-2.5 h-7 rounded-md text-xs font-medium transition-all active:scale-[0.99] active:duration-120 cursor-pointer ${
                          isWriting
                            ? "bg-[#6FAA7D]/10 text-[#6FAA7D] hover:bg-[#6FAA7D]/20"
                            : "bg-[#F1F1F0] text-[#292524] hover:bg-[#EBEBE9]"
                        }`}
                        aria-label="去飞书创作"
                      >
                        {isWriting ? "去飞书" : "我要写"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 底部分页器简化：页码按钮去灰底 */}
      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-1 select-none text-xs text-[#78716C] font-normal">
          <span>
            共 <strong className="tabular-nums font-medium text-[#1C1917]">{totalCount}</strong> 条干货选题，本页{" "}
            <strong className="tabular-nums font-medium text-[#1C1917]">{items.length}</strong> 条
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="h-8 px-2.5 rounded-md text-[13px] text-[#78716C] hover:bg-[#F1F1F0] hover:text-[#1C1917] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#78716C] transition-colors cursor-pointer"
              aria-label="上一页"
            >
              上一页
            </button>
            {pageWindow.map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                aria-current={currentPage === page ? "page" : undefined}
                className={`w-8 h-8 rounded-md text-[13px] transition-colors cursor-pointer ${
                  currentPage === page
                    ? "bg-white text-[#1C1917] font-medium shadow-2xs"
                    : "text-[#78716C] hover:bg-[#F1F1F0] hover:text-[#1C1917]"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage * 50 >= totalCount}
              onClick={() => onPageChange(currentPage + 1)}
              className="h-8 px-2.5 rounded-md text-[13px] text-[#78716C] hover:bg-[#F1F1F0] hover:text-[#1C1917] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#78716C] transition-colors cursor-pointer"
              aria-label="下一页"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
