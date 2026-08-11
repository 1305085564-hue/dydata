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

export type SortByOption = "ai_recommended" | "avg_play" | "claim_count" | "latest";

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
    <section id="topic-pool-explorer" className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs">
      {/* 极简控制栏 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-6 pb-4 border-b border-zinc-100">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-base font-semibold text-zinc-900 mr-1">选题大盘</h2>
          
          {/* 视图 Tab 分段控制器 */}
          <div className="flex items-center p-1 bg-zinc-100/80 rounded-lg text-xs font-medium text-zinc-600">
            <button
              type="button"
              onClick={() => onViewChange("all")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                currentView === "all"
                  ? "bg-white text-zinc-900 shadow-2xs font-semibold"
                  : "hover:text-zinc-900"
              }`}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => onViewChange("my_claims")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                currentView === "my_claims"
                  ? "bg-white text-zinc-900 shadow-2xs font-semibold"
                  : "hover:text-zinc-900"
              }`}
            >
              我的认领
            </button>
            <button
              type="button"
              onClick={() => onViewChange("my_created")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                currentView === "my_created"
                  ? "bg-white text-zinc-900 shadow-2xs font-semibold"
                  : "hover:text-zinc-900"
              }`}
            >
              我录入的
            </button>
          </div>

          {/* 母题多选 Popover 下拉 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsTopicFilterOpen(!isTopicFilterOpen)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                selectedTopicIds.length > 0
                  ? "border-[#5F82A8] bg-[#5F82A8]/10 text-[#5F82A8] font-semibold"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
              }`}
              aria-expanded={isTopicFilterOpen}
              aria-label="母题筛选"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>母题 {selectedTopicIds.length > 0 ? `(${selectedTopicIds.length})` : "筛选"}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {isTopicFilterOpen && (
              <>
                <div
                  className="fixed inset-0 z-[61]"
                  onClick={() => setIsTopicFilterOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute left-0 top-full mt-2 w-56 bg-white border border-zinc-200 rounded-xl shadow-lg z-[62] p-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 text-xs">
                    <span className="font-semibold text-zinc-800">多选母题</span>
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
                          <span className={isChecked ? "font-semibold text-zinc-900" : "text-zinc-700"}>
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

          {/* 排序下拉 */}
          <div className="flex items-center gap-1.5">
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value as SortByOption)}
              className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-zinc-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#5F82A8]"
              aria-label="排序依据"
            >
              <option value="ai_recommended">✨ AI 智能推荐排序</option>
              <option value="avg_play">均播最高排序</option>
              <option value="claim_count">认领热度排序</option>
              <option value="latest">最新录入排序</option>
            </select>
            {sortBy === "ai_recommended" && (
              <Badge variant="outline" className="text-[11px] border-[#D97757]/30 bg-[#D97757]/10 text-[#D97757] flex items-center gap-1 font-medium px-2 py-0.5 shrink-0">
                <Sparkles className="size-3 text-[#D97757]" />
                AI
              </Badge>
            )}
          </div>
        </div>

        {/* 搜题、时间窗、视图与新建 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 时间范围 */}
          <select
            value={currentTimeRange}
            onChange={(e) => onTimeRangeChange(e.target.value as TopicTimeRange)}
            className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-zinc-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#5F82A8]"
            aria-label="时间范围"
          >
            <option value="3d">近 3 天</option>
            <option value="1w">近 1 周</option>
            <option value="1m">近 1 个月</option>
            <option value="3m">近 3 个月</option>
            <option value="all">全部历史</option>
          </select>

          {/* 搜索框 */}
          <div className="relative">
            <input
              type="text"
              placeholder="搜索选题 / Hook..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg pl-7 pr-2 py-1.5 w-32 focus:w-48 sm:w-36 sm:focus:w-52 focus:outline-none focus:ring-1 focus:ring-[#5F82A8] text-zinc-800 placeholder:text-zinc-400 font-normal transition-all"
              aria-label="搜索选题"
            />
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2 top-2 pointer-events-none" />
          </div>

          {/* 网格/表格模式 */}
          <div className="flex items-center p-1 bg-zinc-100/80 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setDisplayMode("grid")}
              className={`p-1 rounded ${displayMode === "grid" ? "bg-white text-zinc-900 shadow-2xs" : "text-zinc-500 hover:text-zinc-800"}`}
              title="网格视图"
              aria-label="切换至网格视图"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("table")}
              className={`p-1 rounded ${displayMode === "table" ? "bg-white text-zinc-900 shadow-2xs" : "text-zinc-500 hover:text-zinc-800"}`}
              title="表格视图"
              aria-label="切换至表格视图"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 主 CTA：新增子题 */}
          <button
            type="button"
            onClick={onCreateClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.97] text-white text-xs font-medium transition-all shadow-2xs"
            aria-label="新增选题"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>新增选题</span>
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
        <div className="py-12 text-center border border-rose-200 rounded-xl bg-rose-50/60 p-6">
          <AlertCircle className="w-6 h-6 text-rose-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-rose-900">选题池加载失败</p>
          <p className="text-xs text-rose-600 mt-1 font-normal">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-100 active:scale-[0.97] transition-all"
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
              <h3 className="text-sm font-semibold text-zinc-800 mb-1">还没有选题</h3>
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
              <h3 className="text-sm font-semibold text-zinc-800 mb-1">未找到符合条件的选题</h3>
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
            const isMyClaimed = !!item.myClaim && item.myClaim.status !== "returned";

            return (
              <div
                key={sub.id}
                onClick={() => onSelectTopic(sub.id)}
                className="group relative bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-xs transition-all duration-200 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2 min-w-0">
                    <span className="text-xs font-normal px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 truncate min-w-0">
                      {sub.topics?.name || "常规"} {sub.topic_groups?.name ? `· ${sub.topic_groups.name}` : ""}
                    </span>

                    {/* 状态标签 */}
                    <div className="flex items-center gap-1 shrink-0">
                      {(item.scriptingCount ?? 0) > 0 && (
                        <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200/80 px-1.5 py-0.5 rounded font-normal inline-flex items-center gap-1">
                          <PenTool className="w-3 h-3 text-sky-600" />
                          <span>{item.scriptingCount} 人写作中</span>
                        </span>
                      )}
                      {isMyClaimed && (
                        <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-normal">
                          已在候选
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-zinc-900 group-hover:text-[#D97757] transition-colors line-clamp-1 mb-1">
                    {sub.title}
                  </h3>
                  <p className="text-xs text-zinc-500 line-clamp-2 mb-3 leading-relaxed font-normal">
                    “{sub.hook || "暂无 Hook"}”
                  </p>
                </div>

                <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs min-w-0">
                  <div className="text-zinc-500 text-xs tabular-nums truncate min-w-0 pr-2">
                    热度: <span className="font-semibold text-zinc-700">{item.claimCount || 0}</span>
                    {summary?.averagePlayCount ? (
                      <span className="ml-2">
                        均播: <span className="font-semibold text-[#D97757]">{(summary.averagePlayCount / 10000).toFixed(1)}万</span>
                      </span>
                    ) : null}
                  </div>

                  {/* 克制化的卡片行内次级按钮 */}
                  {isMyClaimed ? (
                    <button
                      type="button"
                      disabled={operatingId === sub.id}
                      onClick={(e) => handleReturn(e, sub.id)}
                      className="px-2.5 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-medium transition-colors shrink-0"
                      aria-label="放弃认领"
                    >
                      放弃认领
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={operatingId === sub.id}
                      onClick={(e) => handleClaim(e, sub.id)}
                      className="px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-600 hover:bg-[#D97757] hover:text-white active:scale-[0.97] text-xs font-medium transition-all shrink-0 border border-zinc-200/60 hover:border-transparent"
                      aria-label="认领写此题"
                    >
                      认领
                    </button>
                  )}
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
                const isMyClaimed = !!item.myClaim && item.myClaim.status !== "returned";

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
                      {sub.topic_groups?.name ? ` / ${sub.topic_groups.name}` : ""}
                    </td>
                    <td className="py-3 px-3 text-zinc-600 tabular-nums">
                      <div>均播: <span className="font-semibold text-[#D97757]">{summary?.averagePlayCount ? `${(summary.averagePlayCount / 10000).toFixed(1)}万` : "无"}</span></div>
                      <div className="text-xs text-zinc-500 font-normal">
                        热度: {item.claimCount || 0} 人认领
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {(item.scriptingCount ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 border border-sky-200/80 px-1.5 py-0.5 rounded font-normal">
                          <PenTool className="w-3 h-3 text-sky-600" />
                          <span>{item.scriptingCount} 人写作中</span>
                        </span>
                      ) : (item.claimCount || 0) > 0 ? (
                        <span className="inline-block text-xs bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-normal">
                          {item.claimCount} 人已认领
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500 font-normal">0 人竞争</span>
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
                          className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all"
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

      {/* 分页条（有数据时才显示） */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-100 text-xs text-zinc-500 font-normal">
          <span>共 {totalCount} 条记录，本页 {visibleItems.length} 条</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="px-2.5 py-1 rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-40"
              aria-label="上一页"
            >
              上一页
            </button>
            <span className="text-zinc-700 font-medium tabular-nums">第 {currentPage} 页</span>
            <button
              type="button"
              disabled={currentPage * 50 >= totalCount}
              onClick={() => onPageChange(currentPage + 1)}
              className="px-2.5 py-1 rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-40"
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
