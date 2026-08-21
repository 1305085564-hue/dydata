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
  PenTool,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  TopicPoolItem,
  TopicOption,
  TopicPoolView,
  TopicTimeRange,
} from "./types";

export type SortByOption =
  "ai_recommended" | "avg_play" | "claim_count" | "latest";

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
  sortBy: SortByOption;
  onPageChange: (page: number) => void;
  onViewChange: (view: TopicPoolView) => void;
  onTimeRangeChange: (timeRange: TopicTimeRange) => void;
  onTopicIdsChange: (topicIds: string[]) => void;
  onSortByChange: (sortBy: SortByOption) => void;
  onSearchQueryChange: (query: string) => void;
  onRetry: () => void;
  onClaim: (subTopicId: string) => Promise<void>;
  onReturnClaim: (subTopicId: string) => Promise<void>;
  onSelectTopic: (subTopicId: string) => void;
  onCreateClick: () => void;
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
  sortBy,
  onPageChange,
  onViewChange,
  onTimeRangeChange,
  onTopicIdsChange,
  onSortByChange,
  onSearchQueryChange,
  onRetry,
  onClaim,
  onReturnClaim,
  onSelectTopic,
  onCreateClick,
}: TopicPoolExplorerProps) {
  const [displayMode, setDisplayMode] = useState<"grid" | "table">("grid");
  const [operatingId, setOperatingId] = useState<string | null>(null);
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

  const visibleItems = items;

  const handleClaim = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      setOperatingId(id);
      await onClaim(id);
    } finally {
      setOperatingId(null);
    }
  };

  const handleReturn = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      setOperatingId(id);
      await onReturnClaim(id);
    } finally {
      setOperatingId(null);
    }
  };

  return (
    <section
      id="topic-pool-explorer"
      className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs"
    >
      {/* 控制栏：左右主次分层 (纯留白自然平铺，微气垫与呼吸微竖线) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 py-1">
        {/* 左侧：微气垫 Tab 视角切换群 */}
        <div className="inline-flex items-center gap-1 bg-zinc-100/70 p-1 rounded-xl select-none">
          <button
            type="button"
            onClick={() => onViewChange("all")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              currentView === "all"
                ? "bg-white text-zinc-950 font-medium"
                : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50"
            }`}
          >
            <span>全部</span>
            {totalCount > 0 && (
              <span
                className={`text-[11px] tabular-nums ${
                  currentView === "all"
                    ? "text-[#D97757] font-medium"
                    : "text-zinc-400 font-normal"
                }`}
              >
                {totalCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => onViewChange("my_claims")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              currentView === "my_claims"
                ? "bg-white text-zinc-950 font-medium"
                : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50"
            }`}
          >
            我的认领
          </button>
          <button
            type="button"
            onClick={() => onViewChange("my_created")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              currentView === "my_created"
                ? "bg-white text-zinc-950 font-medium"
                : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50"
            }`}
          >
            我录入的
          </button>
        </div>

        {/* 右侧：过滤、排序、搜索与行动组 (两字原则 + 对齐箭头) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 搜索框 (轻量通透微胶囊，无硬边框) */}
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="搜索..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="text-xs bg-zinc-100/70 hover:bg-zinc-100 focus:bg-white border-0 rounded-lg pl-7 pr-2.5 py-1.5 w-28 focus:w-44 sm:w-32 sm:focus:w-48 focus:outline-none focus:ring-1 focus:ring-zinc-300 focus:shadow-2xs text-zinc-800 placeholder:text-zinc-400 font-normal transition-all"
              aria-label="搜索选题"
            />
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2 pointer-events-none" />
          </div>

          {/* 母题多选 Popover 下拉 (去框平铺) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsTopicFilterOpen(!isTopicFilterOpen)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedTopicIds.length > 0
                  ? "bg-[#43718E]/10 text-[#43718E] font-semibold"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 font-normal"
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
                <div className="absolute right-0 sm:left-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] bg-white border border-zinc-200 rounded-xl shadow-lg z-[62] p-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 text-xs">
                    <span className="font-semibold text-zinc-800">
                      母题
                    </span>
                    {selectedTopicIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onTopicIdsChange([])}
                        className="text-xs text-zinc-500 hover:text-zinc-700 font-normal"
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
                          className="flex items-center gap-2 p-1.5 hover:bg-zinc-50 rounded-md text-xs font-normal cursor-pointer text-zinc-700"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTopicId(t.id)}
                            className="rounded text-[#D97757] focus:ring-[#D97757]"
                          />
                          <span
                            className={
                              isChecked
                                ? "font-semibold text-zinc-900"
                                : "text-zinc-700"
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

          {/* 排序下拉 (去框平铺 + 自定义统一箭头) */}
          <div className="relative inline-flex items-center">
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value as SortByOption)}
              className="appearance-none text-xs bg-transparent hover:bg-zinc-100 rounded-lg pl-2 pr-5.5 py-1.5 text-zinc-600 hover:text-zinc-950 font-normal focus:outline-none cursor-pointer transition-colors"
              aria-label="排序依据"
            >
              <option value="ai_recommended">推荐</option>
              <option value="avg_play">均播</option>
              <option value="claim_count">热度</option>
              <option value="latest">最新</option>
            </select>
            <ChevronDown className="size-3.5 text-zinc-400 absolute right-1.5 pointer-events-none" />
            {sortBy === "ai_recommended" && (
              <Badge
                variant="outline"
                title="综合近 30 天合格均播与团队防撞车权重推荐"
                className="text-[11px] border-[#D97757]/30 bg-[#D97757]/10 text-[#D97757] flex items-center gap-1 font-medium px-1.5 py-0.5 shrink-0 cursor-help ml-1"
              >
                <Sparkles className="size-3 text-[#D97757]" />
              </Badge>
            )}
          </div>

          {/* 时间范围下拉 (去框平铺 + 自定义统一箭头) */}
          <div className="relative inline-flex items-center">
            <select
              value={currentTimeRange}
              onChange={(e) =>
                onTimeRangeChange(e.target.value as TopicTimeRange)
              }
              className="appearance-none text-xs bg-transparent hover:bg-zinc-100 rounded-lg pl-2 pr-5.5 py-1.5 text-zinc-600 hover:text-zinc-950 font-normal focus:outline-none cursor-pointer transition-colors"
              aria-label="时间范围"
            >
              <option value="all">全部</option>
              <option value="3m">90天</option>
              <option value="1m">30天</option>
              <option value="1w">7天</option>
              <option value="3d">3天</option>
            </select>
            <ChevronDown className="size-3.5 text-zinc-400 absolute right-1.5 pointer-events-none" />
          </div>

          {/* 结构呼吸微竖线 */}
          <div className="h-4 w-px bg-zinc-200 hidden sm:block mx-0.5 shrink-0" aria-hidden="true" />

          {/* 网格/表格模式切换 (去框平铺) */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setDisplayMode("grid")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                displayMode === "grid"
                  ? "bg-zinc-100 text-zinc-900 font-medium"
                  : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100/60"
              }`}
              title="网格视图"
              aria-label="切换至网格视图"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("table")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                displayMode === "table"
                  ? "bg-zinc-100 text-zinc-900 font-medium"
                  : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100/60"
              }`}
              title="表格视图"
              aria-label="切换至表格视图"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 结构呼吸微竖线 */}
          <div className="h-4 w-px bg-zinc-200 hidden sm:block mx-0.5 shrink-0" aria-hidden="true" />

          {/* 主 CTA：录入 (修复双加号，单加号图标 + 录入) */}
          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.97] text-white text-xs font-medium transition-all shadow-2xs cursor-pointer"
            aria-label="录入选题"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>录入</span>
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      {loading ? (
        <div className="py-16 text-center">
          <RefreshCw className="w-5 h-5 text-zinc-400 animate-spin mx-auto mb-2" />
          <p className="text-xs text-zinc-500 font-normal">数据加载中...</p>
        </div>
      ) : error ? (
        <div className="py-12 text-center border border-zinc-200 rounded-xl bg-zinc-100/60 p-6">
          <AlertCircle className="w-6 h-6 text-[#DC2626] mx-auto mb-2" />
          <p className="text-sm font-semibold text-zinc-600">选题池加载失败</p>
          <p className="text-xs text-[#DC2626] mt-1 font-normal">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-100 active:scale-[0.97] transition-all"
            aria-label="重试加载选题池"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重试</span>
          </button>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="py-16 px-4 text-center border border-dashed border-zinc-200 rounded-2xl bg-white shadow-xs">
          <div className="w-10 h-10 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
            <Search className="w-5 h-5" />
          </div>
          {totalCount === 0 && !searchQuery && selectedTopicIds.length === 0 ? (
            <>
              <h3 className="text-sm font-semibold text-zinc-800 mb-1">
                还没有选题
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4 font-normal leading-relaxed">
                还没有选题，点右上角录入第一个
              </p>
              <button
                type="button"
                onClick={onCreateClick}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.97] text-white text-xs font-medium transition-all shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>录入第一个选题</span>
              </button>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-zinc-800 mb-1">
                未找到符合条件的选题
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto font-normal leading-relaxed">
                尝试调整搜索词、母题多选或时间范围筛选条件
              </p>
            </>
          )}
        </div>
      ) : displayMode === "grid" ? (
        /* 网格视图：实体轻边框 border-zinc-200 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleItems.map((item) => {
            const sub = item;
            const summary = item.summary;
            const isMyClaimed =
              !!item.myClaim && item.myClaim.status !== "returned";

            return (
              <div
                key={sub.id}
                onClick={() => onSelectTopic(sub.id)}
                className="group relative bg-white border border-zinc-200/90 rounded-2xl p-4.5 hover:border-zinc-300/90 hover:shadow-xs transition-all duration-200 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* 顶栏：彻底放空右侧，只保留最纯正通透的母题与分组标签 */}
                  <div className="flex items-center justify-between gap-1.5 mb-2 min-w-0">
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded-md bg-zinc-100/80 text-zinc-600 truncate min-w-0">
                      {sub.topics?.name || "常规"}{" "}
                      {sub.topic_groups?.name
                        ? `· ${sub.topic_groups.name}`
                        : ""}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-zinc-900 group-hover:text-[#D97757] transition-colors line-clamp-1 mb-1.5 tracking-tight">
                    {sub.title}
                  </h3>
                  <p className="text-xs text-zinc-500 line-clamp-2 mb-3.5 leading-relaxed font-normal">
                    {sub.hook ? `“${sub.hook}”` : "暂无 Hook"}
                  </p>
                </div>

                <div className="pt-1 flex items-center justify-between text-xs min-w-0">
                  {/* 底栏统一冷灰排版：写作中防撞车、均播、认领人次合一 */}
                  <div className="text-zinc-500 text-xs tabular-nums truncate min-w-0 pr-2 flex items-center gap-1.5 font-normal">
                    {(item.scriptingCount ?? 0) > 0 ? (
                      <span className="text-zinc-800 font-medium inline-flex items-center gap-1">
                        <PenTool className="w-3 h-3 text-[#43718E]" />
                        <span>{item.scriptingCount} 人在写</span>
                      </span>
                    ) : isMyClaimed ? (
                      <span className="text-emerald-700 font-medium">
                        已在候选
                      </span>
                    ) : null}

                    {((item.scriptingCount ?? 0) > 0 || isMyClaimed) && (
                      <span className="text-zinc-300 select-none">·</span>
                    )}

                    {summary?.averagePlayCount ? (
                      <span className="text-zinc-800 font-medium">
                        均播 {(summary.averagePlayCount / 10000).toFixed(1)}万
                      </span>
                    ) : (
                      <span className="text-zinc-400">暂无成片</span>
                    )}

                    <span className="text-zinc-300 select-none">·</span>
                    <span>
                      {item.claimCount || 0} 人认领
                    </span>
                  </div>

                  {/* 右侧常态彻底留白，Hover 优雅浮出 */}
                  <div className="shrink-0">
                    {isMyClaimed ? (
                      <button
                        type="button"
                        disabled={operatingId === sub.id}
                        onClick={(e) => handleReturn(e, sub.id)}
                        className="px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-medium transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label="放弃认领"
                      >
                        放弃认领
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={operatingId === sub.id}
                        onClick={(e) => handleClaim(e, sub.id)}
                        className="px-2.5 py-1 rounded-md bg-[#D97757] text-white hover:bg-[#C46A4D] active:scale-[0.97] text-xs font-medium shadow-2xs transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label="认领写此题"
                      >
                        认领
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 表格视图：实体细线 border-zinc-200 */
        <div className="overflow-x-auto border border-zinc-200 rounded-xl">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 bg-zinc-50/50">
                <th className="py-2.5 px-3 font-medium">选题名称 / Hook</th>
                <th className="py-2.5 px-3 font-medium">母题与分组</th>
                <th className="py-2.5 px-3 font-medium">均播 / 认领热度</th>
                <th className="py-2.5 px-3 font-medium">防撞车状态</th>
                <th className="py-2.5 px-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {visibleItems.map((item) => {
                const sub = item;
                const summary = item.summary;
                const isMyClaimed =
                  !!item.myClaim && item.myClaim.status !== "returned";

                return (
                  <tr
                    key={sub.id}
                    onClick={() => onSelectTopic(sub.id)}
                    className="group hover:bg-zinc-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-3 max-w-xs">
                      <div className="font-semibold text-zinc-900 truncate hover:text-[#D97757]">
                        {sub.title}
                      </div>
                      <div className="text-zinc-500 text-xs truncate font-normal">
                        “{sub.hook || "暂无 Hook"}”
                      </div>
                    </td>
                    <td className="py-3 px-3 text-zinc-600 font-normal">
                      {sub.topics?.name || "常规"}
                      {sub.topic_groups?.name
                        ? ` / ${sub.topic_groups.name}`
                        : ""}
                    </td>
                    <td className="py-3 px-3 text-zinc-600 tabular-nums">
                      <div>
                        均播:{" "}
                        <span className="font-semibold text-[#D97757]">
                          {summary?.averagePlayCount
                            ? `${(summary.averagePlayCount / 10000).toFixed(1)}万`
                            : "无"}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 font-normal">
                        热度: {item.claimCount || 0} 人认领
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {(item.scriptingCount ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-600 border border-zinc-200 px-1.5 py-0.5 rounded font-normal">
                          <PenTool className="w-3 h-3 text-[#43718E]" />
                          <span>{item.scriptingCount} 人写作中</span>
                        </span>
                      ) : (item.claimCount || 0) > 0 ? (
                        <span className="inline-block text-[11px] bg-zinc-100 text-zinc-600 border border-zinc-200/80 px-1.5 py-0.5 rounded font-normal">
                          {item.claimCount} 人已认领
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400 font-normal">
                          0 人竞争
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isMyClaimed ? (
                        <button
                          type="button"
                          disabled={operatingId === sub.id}
                          onClick={(e) => handleReturn(e, sub.id)}
                          className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-medium transition-colors"
                          aria-label="放弃认领"
                        >
                          放弃认领
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={operatingId === sub.id}
                          onClick={(e) => handleClaim(e, sub.id)}
                          className="px-2.5 py-1 rounded-md bg-[#D97757] text-white hover:bg-[#C46A4D] active:scale-[0.97] text-xs font-medium opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-all shadow-2xs"
                          aria-label="认领"
                        >
                          认领
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页条（纯留白自然平铺沉底） */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between py-2 px-1 select-none text-xs text-zinc-600 font-normal">
          <span>
            共 <span className="font-normal text-zinc-800 tabular-nums">{totalCount}</span> 条记录，本页 <span className="font-normal text-zinc-800 tabular-nums">{visibleItems.length}</span> 条
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="inline-flex h-7 items-center justify-center gap-0.5 rounded-md px-2 text-[11.5px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-600 transition-all cursor-pointer active:scale-95"
              aria-label="上一页"
            >
              上一页
            </button>
            <span className="text-zinc-800 font-medium tabular-nums px-1 text-[11.5px]">
              第 {currentPage} 页
            </span>
            <button
              type="button"
              disabled={currentPage * 50 >= totalCount}
              onClick={() => onPageChange(currentPage + 1)}
              className="inline-flex h-7 items-center justify-center gap-0.5 rounded-md px-2 text-[11.5px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-600 transition-all cursor-pointer active:scale-95"
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
