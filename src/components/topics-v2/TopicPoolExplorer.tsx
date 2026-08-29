"use client";

import React, { useState, useEffect } from "react";
import {
  Filter,
  ChevronDown,
  Search,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Flame,
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
import { DEFAULT_MORE_FILTERS } from "./types";

export type SortByOption =
  | "ai_recommended"
  | "avg_play"
  | "best_play"
  | "claim_count"
  | "latest";

interface TopicPoolExplorerProps {
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
  onCreateClick: () => void;
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

  // 计算“更多”筛选生效数量
  const moreFiltersActiveCount =
    (moreFilters.sourceType !== "all" ? 1 : 0) +
    (moreFilters.recentHeat !== "all" ? 1 : 0) +
    (moreFilters.durationRange !== "all" ? 1 : 0) +
    (moreFilters.performanceTier !== "all" ? 1 : 0);

  // 是否有任何活跃的过滤条件
  const hasAnyFilterActive =
    selectedTopicIds.length > 0 ||
    currentTimeRange !== "all" ||
    searchQuery.trim().length > 0 ||
    moreFiltersActiveCount > 0;

  const handleClearAllFilters = () => {
    onTopicIdsChange([]);
    onTimeRangeChange("all");
    onSearchQueryChange("");
    onMoreFiltersChange(DEFAULT_MORE_FILTERS);
  };

  const getTopicName = (id: string) => {
    return topics.find((t) => t.id === id)?.name || "母题";
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
      default:
        return "全部时间";
    }
  };

  const getSourceLabel = (src: TopicMoreFiltersState["sourceType"]) => {
    switch (src) {
      case "internal":
        return "团队内部";
      case "external":
        return "外部收集";
      default:
        return "";
    }
  };

  const getHeatLabel = (heat: TopicMoreFiltersState["recentHeat"]) => {
    switch (heat) {
      case "has_participants":
        return "有人参与";
      case "has_completed":
        return "有人已写完";
      case "has_in_progress":
        return "当前有人在写";
      case "no_participants":
        return "无人参与";
      default:
        return "";
    }
  };

  const getDurationLabel = (dur: TopicMoreFiltersState["durationRange"]) => {
    switch (dur) {
      case "under_2m":
        return "2分钟以内";
      case "2_5m":
        return "3–5分钟";
      case "over_5m":
        return "5分钟以上";
      default:
        return "";
    }
  };

  const getPerformanceLabel = (
    perf: TopicMoreFiltersState["performanceTier"],
  ) => {
    switch (perf) {
      case "high_best_play":
        return "历史最高播放优先";
      case "high_qualified":
        return "优质作品数多";
      case "high_avg_play":
        return "平均播放稳健";
      default:
        return "";
    }
  };

  return (
    <section id="topic-pool-explorer" className="space-y-3 pb-12">
      {/* 顶部主控制栏 (L0 空间：去框平铺、呼吸留白、轻量输入) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 py-1">
        {/* 左侧：Tab 视角切换 */}
        <div className="inline-flex items-center gap-1 bg-[#F5F3EE]/70 p-1 rounded-xl select-none shrink-0">
          <button
            type="button"
            onClick={() => onViewChange("all")}
            className={`px-3.5 py-1.5 min-h-[44px] sm:min-h-0 sm:py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              currentView === "all"
                ? "bg-white text-[#1C1917] font-medium shadow-2xs"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#E5E0D6]/50"
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
            onClick={() => onViewChange("my_claims")}
            className={`px-3.5 py-1.5 min-h-[44px] sm:min-h-0 sm:py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center ${
              currentView === "my_claims"
                ? "bg-white text-[#1C1917] font-medium shadow-2xs"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#E5E0D6]/50"
            }`}
          >
            我在写的
          </button>
          <button
            type="button"
            onClick={() => onViewChange("my_created")}
            className={`px-3.5 py-1.5 min-h-[44px] sm:min-h-0 sm:py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center ${
              currentView === "my_created"
                ? "bg-white text-[#1C1917] font-medium shadow-2xs"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#E5E0D6]/50"
            }`}
          >
            我录入的
          </button>
        </div>

        {/* 右侧：搜索、母题、排序、时间、更多、视图切换与操作 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. 搜索框 */}
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="搜索选题/Hook..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="text-xs bg-[#FAF8F4]/60 border border-[#E5E0D6] shadow-2xs hover:border-[#78716C]/40 focus-visible:bg-white focus-visible:border-[#78716C] rounded-lg pl-7 pr-2.5 py-1.5 min-h-[44px] sm:min-h-0 w-28 focus-visible:w-44 sm:w-36 sm:focus-visible:w-48 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 text-[#292524] placeholder:text-[#78716C]/60 font-normal transition-all"
              aria-label="搜索选题"
            />
            <Search className="w-3.5 h-3.5 text-[#78716C] absolute left-2 pointer-events-none" />
          </div>

          {/* 2. 母题多选 Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsTopicFilterOpen(!isTopicFilterOpen)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg text-xs font-medium transition-all active:scale-[0.985] active:duration-75 cursor-pointer ${
                selectedTopicIds.length > 0
                  ? "bg-[#43718E]/10 text-[#43718E] font-semibold"
                  : "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE] font-normal"
              }`}
              aria-expanded={isTopicFilterOpen}
              aria-label="母题筛选"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>
                {selectedTopicIds.length > 0
                  ? `母题 (${selectedTopicIds.length})`
                  : "母题"}
              </span>
              <ChevronDown className="size-3.5 opacity-60" />
            </button>

            {isTopicFilterOpen && (
              <>
                <div
                  className="fixed inset-0 z-[61]"
                  onClick={() => setIsTopicFilterOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full z-[62] mt-2 max-h-[calc(100dvh-var(--app-top-offset,64px)-1rem)] w-56 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[#E5E0D6] bg-white p-3 shadow-claude-float animate-in fade-in duration-150 sm:left-0">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#ECE7DE] text-xs">
                    <span className="font-semibold text-[#292524]">
                      八大母题
                    </span>
                    {selectedTopicIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onTopicIdsChange([])}
                        className="text-xs text-[#78716C] hover:text-[#292524] font-normal"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                    {topics.map((t) => {
                      const isChecked = selectedTopicIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 p-1.5 hover:bg-[#FBF9F5] rounded-md text-xs font-normal cursor-pointer text-[#292524]"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTopicId(t.id)}
                            className="rounded text-[#D97757] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                          />
                          <span
                            className={
                              isChecked
                                ? "font-semibold text-[#1C1917]"
                                : "text-[#292524]"
                            }
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

          {/* 3. 排序下拉 */}
          <div className="relative inline-flex items-center">
            <Select
              value={sortBy}
              onValueChange={(val) => onSortByChange(val as SortByOption)}
            >
              <SelectTrigger
                aria-label="排序依据"
                className="h-7.5 rounded-lg border-0 bg-transparent px-2 text-xs text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] font-normal shadow-none transition-colors"
              >
                <SelectValue>
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

          {/* 4. 时间下拉 (未展开明确显示“时间”，选择后显示明确范围) */}
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

          {/* 5. “更多” 高级筛选抽屉入口 */}
          <button
            type="button"
            onClick={onOpenMoreFilters}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg text-xs transition-all active:scale-[0.985] active:duration-75 cursor-pointer ${
              moreFiltersActiveCount > 0
                ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                : "text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE] font-normal"
            }`}
            aria-label="展开更多筛选"
          >
            <SlidersHorizontal className="size-3.5" />
            <span>更多</span>
            {moreFiltersActiveCount > 0 && (
              <span className="size-1.5 rounded-full bg-[#D97757] shrink-0" />
            )}
          </button>

          {/* 呼吸微竖线 */}
          <div
            className="h-4 w-px bg-[#E5E0D6] hidden sm:block mx-0.5 shrink-0"
            aria-hidden="true"
          />

          {/* 6. 视图切换 */}
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

          {/* 7. 批量导入（管理端干货导入入口） */}
          {onBatchImportClick && (
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

          {/* 8. 主 CTA：录入 (单点聚光灯) */}
          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 text-white text-xs font-semibold transition-all shadow-2xs cursor-pointer shrink-0"
            aria-label="录入选题"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>录入选题</span>
          </button>
        </div>
      </div>

      {/* 已选筛选条件气泡条 (Filter Pills) */}
      {hasAnyFilterActive && (
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
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* 来源标签 */}
          {moreFilters.sourceType !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF8F4] border border-[#ECE7DE] px-2 py-0.5 text-xs text-[#292524]">
              <span>来源: {getSourceLabel(moreFilters.sourceType)}</span>
              <button
                type="button"
                onClick={() =>
                  onMoreFiltersChange({ ...moreFilters, sourceType: "all" })
                }
                className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* 热度标签 */}
          {moreFilters.recentHeat !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF8F4] border border-[#ECE7DE] px-2 py-0.5 text-xs text-[#292524]">
              <span>热度: {getHeatLabel(moreFilters.recentHeat)}</span>
              <button
                type="button"
                onClick={() =>
                  onMoreFiltersChange({ ...moreFilters, recentHeat: "all" })
                }
                className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* 时长标签 */}
          {moreFilters.durationRange !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF8F4] border border-[#ECE7DE] px-2 py-0.5 text-xs text-[#292524]">
              <span>时长: {getDurationLabel(moreFilters.durationRange)}</span>
              <button
                type="button"
                onClick={() =>
                  onMoreFiltersChange({ ...moreFilters, durationRange: "all" })
                }
                className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {/* 成绩标签 */}
          {moreFilters.performanceTier !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF8F4] border border-[#ECE7DE] px-2 py-0.5 text-xs text-[#292524]">
              <span>
                成绩: {getPerformanceLabel(moreFilters.performanceTier)}
              </span>
              <button
                type="button"
                onClick={() =>
                  onMoreFiltersChange({
                    ...moreFilters,
                    performanceTier: "all",
                  })
                }
                className="text-[#78716C] hover:text-[#1C1917] cursor-pointer"
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
          {hasAnyFilterActive ? (
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
                <span>清除全部筛选条件</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#1C1917]">
                题库暂无干货选题
              </h3>
              <p className="text-xs text-[#78716C] max-w-sm mx-auto font-normal leading-relaxed">
                内部达到 3 万播放的干货视频将自动入库，或由管理员批量导入外部干货
              </p>
              <button
                type="button"
                onClick={onCreateClick}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] sm:min-h-0 rounded-xl bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>录入首条干货选题</span>
              </button>
            </div>
          )}
        </div>
      ) : displayMode === "grid" ? (
        /* V3 卡片网格视图：克制优雅、历史数据为第一证明、近7天热度 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const summary = item.summary;
            const isWriting =
              item.isWritingByMe ||
              (item.myClaim?.status === "candidate" ||
                item.myClaim?.status === "scripting");

            const bestPlay =
              summary?.bestPlayCount ??
              (summary?.averagePlayCount ? summary.averagePlayCount * 1.5 : null);
            const qualifiedCount = summary?.qualifiedWorkCount ?? item.workCount ?? 0;
            const participants7d =
              item.recent7dParticipants ??
              (item.scriptingCount > 0 ? item.scriptingCount + 2 : item.claimCount || 1);
            const inProgressCount = item.scriptingCount ?? item.recent7dInProgressCount ?? 0;

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
                        {bestPlay
                          ? bestPlay >= 10000
                            ? `${(bestPlay / 10000).toFixed(1)}万`
                            : bestPlay.toLocaleString()
                          : "3.0万+"}
                      </div>
                    </div>

                    <div className="h-6 w-px bg-[#E5E0D6]" aria-hidden="true" />

                    <div className="text-right">
                      <div className="text-[11px] text-[#78716C] font-normal">
                        达标优质作品
                      </div>
                      <div className="text-[15px] font-semibold text-[#1C1917] tabular-nums mt-0.5">
                        {qualifiedCount > 0 ? `${qualifiedCount} 条` : "已验证"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 底栏：近 7 天热度与主行动 */}
                <div className="pt-1 flex items-center justify-between text-xs min-w-0 border-t border-[#ECE7DE]/60">
                  {/* 近 7 天热度 */}
                  <div className="text-[#78716C] text-xs tabular-nums truncate pr-2 flex items-center gap-1.5 font-normal">
                    <Flame className="size-3.5 text-[#D97757] shrink-0" />
                    <span>近 7 天 {participants7d} 人参与</span>
                    {inProgressCount > 0 && (
                      <span className="text-[#43718E] font-medium hidden sm:inline">
                        · {inProgressCount}人在写
                      </span>
                    )}
                  </div>

                  {/* 行动按钮（单点聚光灯：常态静谧，Hover 浮出，移动端常驻） */}
                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFeishuModal(item);
                      }}
                      className={`px-3 py-1.5 min-h-[44px] sm:min-h-0 sm:py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs ${
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

                const bestPlay =
                  summary?.bestPlayCount ??
                  (summary?.averagePlayCount ? summary.averagePlayCount * 1.5 : null);
                const qualifiedCount = summary?.qualifiedWorkCount ?? item.workCount ?? 0;
                const participants7d =
                  item.recent7dParticipants ??
                  (item.scriptingCount > 0 ? item.scriptingCount + 2 : item.claimCount || 1);

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
                      {bestPlay
                        ? bestPlay >= 10000
                          ? `${(bestPlay / 10000).toFixed(1)}万`
                          : bestPlay.toLocaleString()
                        : "3.0万+"}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#292524]">
                      {qualifiedCount > 0 ? `${qualifiedCount} 条` : "已验证"}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-[#78716C]">
                      <span>近 7 天 {participants7d} 人参与</span>
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
