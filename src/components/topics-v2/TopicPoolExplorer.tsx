"use client";

import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  Search,
  LayoutGrid,
  List,
  RefreshCw,
  AlertCircle,
  Sparkles,
  SlidersHorizontal,
  X,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  TopicPoolItem,
  TopicOption,
  TopicPoolView,
  TopicTimeRange,
  TopicMoreFiltersState,
} from "./types";

export type SortByOption =
  | "ai_recommended"
  | "avg_play"
  | "best_play"
  | "claim_count"
  | "latest";

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
  isAdmin?: boolean;
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
  onBatchImportClick?: () => void;
  claimDrawerSlot?: React.ReactNode;
}

export function TopicPoolExplorer({
  items,
  topics,
  loading,
  error,
  totalCount,
  searchQuery,
  currentPage,
  currentView: _currentView,
  currentTimeRange,
  selectedTopicIds,
  moreFilters: _moreFilters,
  sortBy,
  isAdmin = false,
  onPageChange,
  onViewChange: _onViewChange,
  onTimeRangeChange,
  onTopicIdsChange,
  onMoreFiltersChange: _onMoreFiltersChange,
  onOpenMoreFilters,
  onSortByChange,
  onSearchQueryChange,
  onRetry,
  onOpenFeishuModal,
  onSelectTopic,
  onCreateClick: _onCreateClick,
  onBatchImportClick,
}: TopicPoolExplorerProps) {
  const [displayMode, setDisplayMode] = useState<"grid" | "table">("grid");
  const [isTopicFilterOpen, setIsTopicFilterOpen] = useState(false);

  // Esc 按键收起母题 Popover
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopicFilterOpen) {
        setIsTopicFilterOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTopicFilterOpen]);

  // 多选母题勾选切换
  const toggleTopicId = (id: string) => {
    if (selectedTopicIds.includes(id)) {
      onTopicIdsChange(selectedTopicIds.filter((tId) => tId !== id));
    } else {
      onTopicIdsChange([...selectedTopicIds, id]);
    }
  };

  const getTopicName = (id: string) => {
    const topic = topics.find((t) => t.id === id);
    return topic?.name || "未知母题";
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

  // 仅在有真实支持的筛选被激活时显示已选标签条 (母题、时间范围、搜索词)
  const hasRealActiveFilters =
    selectedTopicIds.length > 0 ||
    currentTimeRange !== "all" ||
    searchQuery.trim().length > 0;

  const handleClearAllFilters = () => {
    onTopicIdsChange([]);
    onTimeRangeChange("all");
    onSearchQueryChange("");
  };

  return (
    <section
      id="topic-pool-explorer"
      className="space-y-4"
      aria-label="干货选题大盘"
    >
      {/* 顶栏控制中枢 */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-[#E5E0D6] shadow-2xs">
        {/* 左侧：搜索输入框 */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716C]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="搜索选题标题、核心观点或一句话立意 Hook..."
            className="w-full pl-9 pr-8 py-2 min-h-[44px] sm:min-h-0 text-xs rounded-xl bg-[#FAF8F4] border border-[#ECE7DE] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#D97757] focus:border-[#D97757] transition-all placeholder:text-[#A8A29E] text-[#1C1917]"
            aria-label="搜索干货选题"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
              aria-label="清除搜索词"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 右侧：母题、排序、时间、更多、视图切换 */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* 1. 母题多选触发器 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsTopicFilterOpen(!isTopicFilterOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg text-xs transition-all active:scale-[0.985] active:duration-75 cursor-pointer ${
                selectedTopicIds.length > 0
                  ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                  : "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE] font-normal"
              }`}
              aria-expanded={isTopicFilterOpen}
              aria-label="按母题分类筛选"
            >
              <span>
                {selectedTopicIds.length === 0
                  ? "母题"
                  : `母题 (${selectedTopicIds.length})`}
              </span>
              <ChevronDown className="size-3.5 opacity-60" />
            </button>

            {/* 母题多选下拉浮层 */}
            {isTopicFilterOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsTopicFilterOpen(false)}
                />
                <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 z-40 w-64 rounded-2xl border border-[#E5E0D6] bg-white p-3 shadow-claude-dialog space-y-2 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#ECE7DE] text-xs">
                    <span className="font-semibold text-[#1C1917]">
                      八大母题
                    </span>
                    {selectedTopicIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onTopicIdsChange([])}
                        className="text-[11px] text-[#D97757] hover:underline cursor-pointer"
                      >
                        清空已选
                      </button>
                    )}
                  </div>
                  <div className="max-h-[calc(100dvh-16rem)] overflow-y-auto space-y-1 pr-1">
                    {topics.map((t) => {
                      const isChecked = selectedTopicIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#FAF8F4] text-xs text-[#292524] cursor-pointer select-none transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTopicId(t.id)}
                            className="rounded border-[#E5E0D6] text-[#D97757] focus:ring-[#D97757] size-3.5 cursor-pointer accent-[#D97757]"
                          />
                          <span
                            className={isChecked ? "font-medium text-[#1C1917]" : ""}
                          >
                            {t.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 2. 排序下拉 */}
          <div className="flex items-center">
            <Select
              value={sortBy}
              onValueChange={(val) => onSortByChange(val as SortByOption)}
            >
              <SelectTrigger
                aria-label="排序方式"
                className="h-7.5 rounded-lg border-0 bg-transparent px-2 text-xs font-normal text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors shadow-none"
              >
                <SelectValue placeholder="排序">
                  {sortBy === "ai_recommended"
                    ? "推荐"
                    : sortBy === "best_play"
                      ? "最高播放"
                      : sortBy === "avg_play"
                        ? "均播"
                        : sortBy === "claim_count"
                          ? "7天热度"
                          : "最新"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-[#E5E0D6] bg-[#FAF8F4] shadow-claude-float min-w-28">
                <SelectItem value="ai_recommended">推荐</SelectItem>
                <SelectItem value="best_play">最高播放</SelectItem>
                <SelectItem value="avg_play">均播</SelectItem>
                <SelectItem value="claim_count">7天热度</SelectItem>
                <SelectItem value="latest">最新</SelectItem>
              </SelectContent>
            </Select>
            {sortBy === "ai_recommended" && (
              <Badge
                variant="outline"
                title="综合历史验证高分与近7天创作热度推荐"
                className="text-[11px] border-[#D97757]/30 bg-[#D97757]/10 text-[#D97757] flex items-center gap-1 font-medium px-1.5 py-0.5 shrink-0 cursor-help ml-1"
              >
                <Sparkles className="size-3 text-[#D97757]" />
              </Badge>
            )}
          </div>

          {/* 3. 时间下拉 (未展开明确显示“时间”，选择后显示明确范围) */}
          <Select
            value={currentTimeRange}
            onValueChange={(val) => onTimeRangeChange(val as TopicTimeRange)}
          >
            <SelectTrigger
              aria-label="时间范围"
              className={`h-7.5 rounded-lg border-0 bg-transparent px-2 text-xs transition-colors shadow-none ${
                currentTimeRange !== "all"
                  ? "font-semibold text-[#1C1917] bg-[#F5F3EE]"
                  : "font-normal text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917]"
              }`}
            >
              <SelectValue>
                {currentTimeRange === "all"
                  ? "时间"
                  : getTimeRangeLabel(currentTimeRange)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-[#E5E0D6] bg-[#FAF8F4] shadow-claude-float min-w-28">
              <SelectItem value="all">全部时间</SelectItem>
              <SelectItem value="3m">近 90 天</SelectItem>
              <SelectItem value="1m">近 30 天</SelectItem>
              <SelectItem value="1w">近 7 天</SelectItem>
              <SelectItem value="3d">近 3 天</SelectItem>
            </SelectContent>
          </Select>

          {/* 4. “更多” 高级筛选抽屉入口 */}
          <button
            type="button"
            onClick={onOpenMoreFilters}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg text-xs text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F3EE] font-normal transition-all active:scale-[0.985] active:duration-75 cursor-pointer"
            aria-label="展开更多筛选"
          >
            <SlidersHorizontal className="size-3.5" />
            <span>更多</span>
          </button>

          {/* 呼吸微竖线 */}
          <div
            className="h-4 w-px bg-[#E5E0D6] hidden sm:block mx-0.5 shrink-0"
            aria-hidden="true"
          />

          {/* 5. 视图切换 */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setDisplayMode("grid")}
              className={`p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                displayMode === "grid"
                  ? "bg-[#F5F3EE] text-[#1C1917] font-medium"
                  : "text-[#78716C] hover:text-[#292524] hover:bg-[#F5F3EE]/60"
              }`}
              title="网格视图"
              aria-label="切换至网格视图"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("table")}
              className={`p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                displayMode === "table"
                  ? "bg-[#F5F3EE] text-[#1C1917] font-medium"
                  : "text-[#78716C] hover:text-[#292524] hover:bg-[#F5F3EE]/60"
              }`}
              title="表格视图"
              aria-label="切换至表格视图"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 6. 管理员专属：批量导入入口 */}
          {isAdmin && onBatchImportClick && (
            <button
              type="button"
              onClick={onBatchImportClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg border border-[#E5E0D6] bg-white hover:bg-[#FAF8F4] text-[#292524] text-xs font-medium transition-all shadow-2xs cursor-pointer shrink-0"
              aria-label="批量导入外部选题"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#78716C]" />
              <span>批量导入</span>
            </button>
          )}
        </div>
      </div>

      {/* 已选筛选条件气泡条 (Filter Pills，只展示真实生效项) */}
      {hasRealActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 pb-1">
          <span className="text-[11.5px] text-[#78716C] mr-1">已生效筛选:</span>

          {/* 母题标签 */}
          {selectedTopicIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-md bg-[#FAF8F4] border border-[#ECE7DE] px-2 py-0.5 text-xs text-[#292524]"
            >
              <span>母题: {getTopicName(id)}</span>
              <button
                type="button"
                onClick={() => toggleTopicId(id)}
                className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                aria-label={`移除母题筛选 ${getTopicName(id)}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}

          {/* 时间标签 */}
          {currentTimeRange !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF8F4] border border-[#ECE7DE] px-2 py-0.5 text-xs text-[#292524]">
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
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF8F4] border border-[#ECE7DE] px-2 py-0.5 text-xs text-[#292524]">
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
        <div className="py-12 text-center border border-[#E5E0D6] rounded-2xl bg-[#F5F3EE]/60 p-6 space-y-3">
          <AlertCircle className="w-6 h-6 text-[#DC2626] mx-auto" />
          <div>
            <p className="text-sm font-semibold text-[#1C1917]">
              选题库数据加载失败
            </p>
            <p className="text-xs text-[#DC2626] mt-0.5 font-normal">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] sm:min-h-0 rounded-xl bg-white border border-[#E5E0D6] text-xs font-medium text-[#292524] hover:bg-[#F5F3EE] active:scale-[0.985] active:duration-75 transition-all shadow-2xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重新加载</span>
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 px-4 text-center border border-dashed border-[#E5E0D6] rounded-2xl bg-transparent space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#F5F3EE] text-[#A8A29E] flex items-center justify-center mx-auto">
            <Search className="w-5 h-5" />
          </div>
          {hasRealActiveFilters ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#1C1917]">
                未找到符合条件的选题
              </h3>
              <p className="text-xs text-[#78716C] max-w-sm mx-auto font-normal leading-relaxed">
                当前筛选组合下暂无匹配的干货选题，可尝试清空或放宽筛选条件
              </p>
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] sm:min-h-0 rounded-xl bg-white border border-[#E5E0D6] text-xs font-medium text-[#292524] hover:bg-[#F5F3EE] active:scale-[0.985] active:duration-75 transition-all cursor-pointer"
              >
                清空当前筛选
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#1C1917]">
                干货选题库暂无内容
              </h3>
              <p className="text-xs text-[#78716C] max-w-sm mx-auto font-normal leading-relaxed">
                内部达到 3 万播放的干货视频将自动入库，或由管理员批量导入外部干货
              </p>
            </div>
          )}
        </div>
      ) : displayMode === "grid" ? (
        /* V3 卡片网格视图：克制优雅、真实数据为证明、近7天热度 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const summary = item.summary;
            const isWriting =
              item.isWritingByMe ||
              (item.myClaim?.status === "candidate" ||
                item.myClaim?.status === "scripting");

            // 真实历史数据证明（严禁补造假数据）
            const bestPlay = summary?.bestPlayCount ?? null;
            const qualifiedCount = summary?.qualifiedWorkCount ?? null;
            const participants7d = item.recent7dParticipants ?? item.claimCount ?? null;
            const inProgressCount = item.recent7dInProgressCount ?? (item.scriptingCount > 0 ? item.scriptingCount : 0);

            return (
              <div
                key={item.id}
                onClick={() => onSelectTopic(item.id)}
                className="group relative bg-white border border-[#E5E0D6] rounded-2xl p-4.5 hover:border-[#D97757]/40 hover:shadow-xs transition-all duration-200 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* 顶栏：母题微印章 */}
                  <div className="flex items-center justify-between gap-1.5 mb-2.5 min-w-0">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#FAF8F4] border border-[#ECE7DE] text-[#57534E] truncate">
                      {item.topics?.name || "常规母题"}
                      {item.topic_groups?.name ? ` · ${item.topic_groups.name}` : ""}
                    </span>

                    {/* 在写状态微标记 */}
                    {isWriting && (
                      <span className="text-[11px] font-medium text-[#6FAA7D] bg-[#6FAA7D]/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <CheckCircle2 className="size-3" />
                        <span>已在写</span>
                      </span>
                    )}
                  </div>

                  {/* 标题 */}
                  <h3 className="text-[15px] font-semibold text-[#1C1917] group-hover:text-[#D97757] transition-colors line-clamp-2 leading-snug mb-3">
                    {item.title}
                  </h3>

                  {/* 核心证明：历史成绩指标（第一视觉焦点） */}
                  <div className="rounded-xl bg-[#FAF8F4] border border-[#ECE7DE]/80 p-3 mb-3.5 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-[#78716C] font-normal">
                        历史最高播放
                      </div>
                      <div className="text-[15px] font-semibold text-[#1C1917] tabular-nums mt-0.5">
                        {bestPlay !== null
                          ? bestPlay >= 10000
                            ? `${(bestPlay / 10000).toFixed(1)}万`
                            : bestPlay.toLocaleString()
                          : "—"}
                      </div>
                    </div>

                    <div className="h-6 w-px bg-[#E5E0D6]" aria-hidden="true" />

                    <div className="text-right">
                      <div className="text-[11px] text-[#78716C] font-normal">
                        达标优质作品
                      </div>
                      <div className="text-[15px] font-semibold text-[#1C1917] tabular-nums mt-0.5">
                        {qualifiedCount !== null ? `${qualifiedCount} 条` : "—"}
                      </div>
                    </div>
                  </div>

                  {/* 一句话 Hook 凹槽 */}
                  {item.hook && (
                    <div className="rounded-lg bg-[#FBF9F5] border border-[#ECE7DE]/60 px-2.5 py-1.5 mb-3">
                      <p className="text-[11.5px] text-[#57534E] line-clamp-2 italic">
                        “{item.hook}”
                      </p>
                    </div>
                  )}
                </div>

                {/* 底栏：近 7 天参与热度 + 去飞书创作主行动 */}
                <div className="pt-2 border-t border-[#ECE7DE]/60 flex items-center justify-between gap-2 mt-auto">
                  <div className="text-[11.5px] text-[#78716C] truncate">
                    <span>近 7 天 {participants7d !== null ? `${participants7d} 人参与` : "0 人参与"}</span>
                    {inProgressCount > 0 && (
                      <span className="text-[#43718E] ml-1">
                        · {inProgressCount}人在写
                      </span>
                    )}
                  </div>

                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFeishuModal(item);
                      }}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 min-h-[44px] sm:min-h-0 sm:py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isWriting
                          ? "bg-[#6FAA7D]/10 text-[#6FAA7D] hover:bg-[#6FAA7D]/20"
                          : "bg-[#D97757] text-white hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
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
        <div className="overflow-x-auto border border-[#ECE7DE] rounded-xl">
          <table className="w-full min-w-[720px] text-left text-xs border-collapse">
            <thead className="bg-[#FAF8F4] border-b border-[#ECE7DE] text-[11px] font-semibold text-[#78716C]">
              <tr>
                <th className="py-2.5 px-3">母题</th>
                <th className="py-2.5 px-3 min-w-[240px]">选题名称</th>
                <th className="py-2.5 px-3 text-right">历史最高播放</th>
                <th className="py-2.5 px-3 text-right">优质作品数</th>
                <th className="py-2.5 px-3">近 7 天热度</th>
                <th className="py-2.5 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECE7DE] bg-white">
              {items.map((item) => {
                const summary = item.summary;
                const isWriting =
                  item.isWritingByMe ||
                  (item.myClaim?.status === "candidate" ||
                    item.myClaim?.status === "scripting");

                const bestPlay = summary?.bestPlayCount ?? null;
                const qualifiedCount = summary?.qualifiedWorkCount ?? null;
                const participants7d = item.recent7dParticipants ?? item.claimCount ?? null;

                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectTopic(item.id)}
                    className="group hover:bg-[#FAF8F4]/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-3 text-[#57534E] font-medium whitespace-nowrap">
                      {item.topics?.name || "常规母题"}
                    </td>
                    <td className="py-3 px-3 max-w-sm">
                      <div className="text-[13.5px] font-semibold text-[#1C1917] group-hover:text-[#D97757] truncate">
                        {item.title}
                      </div>
                      {item.hook && (
                        <div className="text-[11.5px] text-[#78716C] truncate mt-0.5">
                          “{item.hook}”
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#1C1917]">
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
                      <span>近 7 天 {participants7d !== null ? `${participants7d} 人参与` : "0 人参与"}</span>
                      {item.scriptingCount > 0 && (
                        <span className="text-[#43718E] ml-1">
                          ({item.scriptingCount}人在写)
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
                        className={`px-2.5 py-1.5 min-h-[44px] sm:min-h-0 sm:py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          isWriting
                            ? "bg-[#6FAA7D]/10 text-[#6FAA7D] hover:bg-[#6FAA7D]/20"
                            : "bg-[#D97757] text-white hover:bg-[#C46A4D]"
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

      {/* 分页底栏 */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between py-2 px-1 select-none text-xs text-[#292524] font-normal">
          <span>
            共 <strong className="tabular-nums font-semibold text-[#1C1917]">{totalCount}</strong> 条干货选题，本页{" "}
            <strong className="tabular-nums font-semibold text-[#1C1917]">{items.length}</strong> 条
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="inline-flex h-11 sm:h-7 min-h-[44px] sm:min-h-0 items-center justify-center gap-0.5 rounded-md px-2.5 text-[12px] sm:text-[11.5px] font-medium text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#292524] transition-all cursor-pointer active:scale-[0.985] active:duration-75"
              aria-label="上一页"
            >
              上一页
            </button>
            <span className="text-[#292524] font-medium tabular-nums px-1 text-[11.5px]">
              第 {currentPage} 页
            </span>
            <button
              type="button"
              disabled={currentPage * 50 >= totalCount}
              onClick={() => onPageChange(currentPage + 1)}
              className="inline-flex h-11 sm:h-7 min-h-[44px] sm:min-h-0 items-center justify-center gap-0.5 rounded-md px-2.5 text-[12px] sm:text-[11.5px] font-medium text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#292524] transition-all cursor-pointer active:scale-[0.985] active:duration-75"
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
