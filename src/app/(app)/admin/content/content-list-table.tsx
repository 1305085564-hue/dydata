import { getContentOwner } from "@/lib/content/content-owner";
import { getCoreAchievementClass } from "@/lib/content/domain/detail";
import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DEFAULT_EVALUATION_STANDARDS, type EvaluationStandards } from "@/lib/evaluation-standards";
import { getStatusDot, type SortField } from "@/lib/content/domain/content-list";
import {
  HIGHLIGHT_CELL_CLASS,
  isCellHighlighted,
  type HighlightFieldKey,
  type HighlightRuleMap,
} from "@/lib/content/domain/content-list-highlight";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import {
  DurationCell,
  Highlightable,
  RatioCell,
  formatCompactDate,
  formatCount,
  formatPercent,
  formatTimeOfDay,
} from "./content-list-cell-content";
import { ContentListTableHeader } from "./content-list-table-header";

type ContentListTableProps = {
  metricViewMode: "full" | "spacious";
  visibleRows: ProcessedContentRow[];
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  emptyTitle: string;
  emptyDescription: string;
  sortField: SortField;
  sortDir: "asc" | "desc";
  handleSort: (field: SortField) => void;
  isSingleDay: boolean;
  selectedVideoId?: string | null;
  onSelectVideoId: (id: string | null) => void;
  ownerNames?: Record<string, string>;
  onSelectAuthor?: (authorId: string, authorName: string) => void;
  highlightRules: HighlightRuleMap;
  evaluationStandards?: EvaluationStandards;
};

export function ContentListTable({
  metricViewMode,
  visibleRows,
  tableContainerRef,
  emptyTitle,
  emptyDescription,
  sortField,
  sortDir,
  handleSort,
  isSingleDay,
  selectedVideoId,
  onSelectVideoId,
  onSelectAuthor,
  ownerNames,
  highlightRules,
  evaluationStandards = DEFAULT_EVALUATION_STANDARDS,
}: ContentListTableProps) {
  const isSpacious = metricViewMode === "spacious";
  const dynamicColSpan = isSpacious ? 12 : 16;
  const cellHit = (item: ProcessedContentRow, key: HighlightFieldKey) =>
    isCellHighlighted(item, key, highlightRules);
  const [hoveredColKey, setHoveredColKey] = useState<string | null>(null);

  // 播放量与完播率最大值（供单日视图微型数据条作为相对比例基准）
  const maxPlayCount = React.useMemo(() => {
    let max = 1;
    for (const row of visibleRows) {
      if (row.playCount && row.playCount > max) max = row.playCount;
    }
    return max;
  }, [visibleRows]);

  // 完播率基准排除 lowSample 行，避免个位数超低播放的高完播孤值压扁整列爆款
  const maxCompletionRate = React.useMemo(() => {
    let max = 1;
    for (const row of visibleRows) {
      if (!row.lowSample && row.completionRate && row.completionRate > max && row.completionRate <= 100) {
        max = row.completionRate;
      }
    }
    // 兜底：如果全部作品均为 lowSample，回退到全局最大值避免除以 1
    if (max === 1) {
      for (const row of visibleRows) {
        if (row.completionRate && row.completionRate > max && row.completionRate <= 100) {
          max = row.completionRate;
        }
      }
    }
    return max;
  }, [visibleRows]);

  // 抽屉切片联动：当前打开的作品如果不在视口内，平滑滚动至可视区；抽屉关闭时自动清除
  React.useEffect(() => {
    if (!selectedVideoId || !tableContainerRef?.current) return;
    // 同一作品在「移动端卡片」和「桌面表格行」各有一份 DOM，桌面端卡片是 display:none。
    // 直接 querySelector 会先命中隐藏的卡片（几何全为 0），滚动指令落在不可见元素上等于没执行，
    // 因此必须挑出真正有渲染盒子（getClientRects 非空）的那一份。
    const candidates = tableContainerRef.current.querySelectorAll<HTMLElement>(
      `[data-video-id="${CSS.escape(selectedVideoId)}"]`,
    );
    const rowEl = Array.from(candidates).find((el) => el.getClientRects().length > 0);
    if (!rowEl) return;
    const rect = rowEl.getBoundingClientRect();
    // 顶部留出 96px（吸顶表头与工具栏防遮挡），底部留出视口高度
    const isAbove = rect.top < 96;
    const isBelow = rect.bottom > window.innerHeight;
    if (isAbove || isBelow) {
      rowEl.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [selectedVideoId, tableContainerRef]);

  return (
    <TooltipProvider delay={100}>
      <div ref={tableContainerRef} className="flex-1 w-full min-h-0">
        {/* 1. 移动端紧凑高密度流 (<768px)：发丝线分隔，一屏 4~5 条，5 项关键指标清晰平铺 */}
        <div className="md:hidden w-full bg-white rounded-xl shadow-card-ring border border-[#E2E2DF]/60 divide-y divide-[#E2E2DF]/60 overflow-hidden">
          {visibleRows.length === 0 ? (
            <div className="py-8 px-4 text-[#1F1E1D]">
              <EmptyState
                variant="compact"
                title={emptyTitle}
                description={emptyDescription}
              />
            </div>
          ) : (
            visibleRows.map((item) => {
              const { video } = item;
              const owner = getContentOwner(video, ownerNames);
              const dot = getStatusDot(video);
              const isSelected = selectedVideoId === video.id;

              return (
                <div
                  key={video.id}
                  data-video-id={video.id}
                  onClick={() => onSelectVideoId(video.id)}
                  className={cn(
                    "group relative flex flex-col gap-1.5 p-3 transition-colors cursor-pointer select-none",
                    isSelected
                      ? "bg-surface-selected/40 hover:bg-surface-selected/60"
                      : "hover:bg-[#F7F7F6] active:bg-[#EBEBE9]"
                  )}
                >
                  {/* 第 1 层：状态徽标 + 发布日期 */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <Badge variant={dot.variant} className="shrink-0 text-[12px] px-1.5 py-0.5">
                        {dot.label}
                      </Badge>


                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className="text-[12px] tabular-nums text-[#78716C] font-normal"
                        title={video.published_at ?? "发布日期未知"}
                      >
                        {isSingleDay ? formatTimeOfDay(video.published_at) : formatCompactDate(video.published_at)}
                      </span>
                      <ChevronRight className="size-3.5 text-[#A8A29E] group-hover:text-[#141413] transition-colors" />
                    </div>
                  </div>

                  {/* 第 2 层：作品标题（主入口，保证键盘 Tab 聚焦与无障碍支持） */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectVideoId(video.id);
                    }}
                    aria-label={`查看作品详情：${video.video_title || video.content?.slice(0, 50) || "未命名视频"}${video.accounts?.name ? `（${video.accounts.name}）` : ""}`}
                    className="w-full min-h-[44px] flex items-center text-left text-[14px] font-normal text-[#1F1E1D] group-hover:text-[#141413] transition-colors rounded-sm outline-none focus-visible:underline focus-visible:decoration-[#141413] focus-visible:decoration-2 focus-visible:underline-offset-2 cursor-pointer line-clamp-2 leading-snug py-1"
                  >
                    {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                  </button>

                  {/* 第 3 层：负责人。账号在作品详情中查看。 */}
                  <div className="flex items-center gap-1.5 text-[12px] text-[#78716C] font-normal truncate">
                    {owner.name && (
                      <span className="shrink-0 text-[#A8A29E]">
                        责任人：
                        {owner.id && onSelectAuthor ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectAuthor(owner.id, owner.name);
                            }}
                            className="text-[#78716C] underline decoration-[#78716C]/40 underline-offset-2 hover:text-[#141413] transition-colors cursor-pointer"
                            title={`查看 ${owner.name} 的全部作品`}
                          >
                            {owner.name}
                          </button>
                        ) : (
                          <span className="text-[#78716C]">{owner.name}</span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* 第 4 层：高密度指标矩阵；平均播放占比在作品详情中查看 */}
                  <div className="grid grid-cols-5 gap-1 pt-1.5 mt-0.5 border-t border-[#E2E2DF]/50 text-center">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C] leading-none mb-1">播放</span>
                      <span className="text-[12px] tabular-nums font-normal text-[#1F1E1D] truncate">
                        <Highlightable hit={cellHit(item, "playCount")}>{formatCount(item.playCount)}</Highlightable>
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C] leading-none mb-1">涨粉</span>
                      <span className="text-[12px] tabular-nums font-normal text-[#1F1E1D] truncate">
                        <Highlightable hit={cellHit(item, "followerGain")}>{formatCount(item.followerGain)}</Highlightable>
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C] leading-none mb-1">完播</span>
                      <RatioCell standards={evaluationStandards} value={item.completionRate} lowSample={item.lowSample} metricType="completion_rate" className={cn("text-[12px] truncate", cellHit(item, "completionRate") && HIGHLIGHT_CELL_CLASS)} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C] leading-none mb-1">互动率</span>
                      <RatioCell standards={evaluationStandards} value={item.interactionRate} achievement={item.quality?.interactionAchievement} lowSample={item.lowSample} className={cn("text-[12px] truncate", cellHit(item, "interactionRate") && HIGHLIGHT_CELL_CLASS)} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-[#78716C] leading-none mb-1">点赞</span>
                      <span className="text-[12px] tabular-nums font-normal text-[#78716C] truncate">
                        <Highlightable hit={cellHit(item, "likes")}>{formatCount(item.likes)}</Highlightable>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 2. 桌面与平板端表格 (≥768px) - 保持原有 100% 结构与样式无回退 */}
        <Card className="hidden md:block flex-1 w-full p-0 gap-0">
              <Table className={cn(
                "text-left border-collapse table-fixed",
                isSpacious ? "min-w-[960px] xl:min-w-full" : "min-w-[960px] md:min-w-[1080px] lg:min-w-[1160px] xl:min-w-full"
              )}>
                <colgroup>
                  <col className="w-[61px]" />
                  <col className="w-[347px]" />
                </colgroup>
                {/* 吸顶表头 */}
                <ContentListTableHeader
                  isSpacious={isSpacious}
                  sortField={sortField}
                  sortDir={sortDir}
                  handleSort={handleSort}
                  hoveredColKey={hoveredColKey}
                />

                <tbody
                  onMouseOver={(e) => {
                    const td = (e.target as HTMLElement).closest("td");
                    const colKey = td?.getAttribute("data-col-key") || null;
                    if (colKey !== hoveredColKey) {
                      setHoveredColKey(colKey);
                    }
                  }}
                  onMouseLeave={() => setHoveredColKey(null)}
                  className="divide-y divide-[#E2E2DF]/60 text-[13px] text-[#1F1E1D]"
                >
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={dynamicColSpan} className="py-8 text-[#1F1E1D]">
                        <EmptyState
                          variant="compact"
                          title={emptyTitle}
                          description={emptyDescription}
                        />
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((item) => {
                      const { video } = item;
                      const owner = getContentOwner(video, ownerNames);
                      const dot = getStatusDot(video);
                      const isSelected = selectedVideoId === video.id;

                      return (
                        <tr
                          key={video.id}
                          data-video-id={video.id}
                          onClick={() => onSelectVideoId(video.id)}
                          className={cn(
                            "group transition-colors duration-150 cursor-pointer has-[button:focus-visible]:bg-[#F7F7F6]",
                            isSelected
                              ? "bg-surface-selected/50 hover:bg-surface-selected/70"
                              : "hover:bg-[#F7F7F6] active:bg-[#EBEBE9]"
                          )}
                        >
                          {/* 状态徽标（降饱和微标签，消灭悬停猜谜；横向滚动冻结首列） */}
                          <td
                            data-col-key="status"
                            className={cn(
                              "sticky left-0 z-20 py-2 px-1 text-center shrink-0 transition-colors",
                              isSelected
                                ? "bg-[#F1F1F0] group-hover:bg-[#EBEBE9]"
                                : "bg-white group-hover:bg-[#F7F7F6] group-active:bg-[#EBEBE9] group-has-[button:focus-visible]:bg-[#F7F7F6]",
                              hoveredColKey === "status" && "bg-surface-row-hover/60",
                            )}
                          >
                            <Badge variant={dot.variant} title={`状态：${dot.label}`}>
                              {dot.label}
                            </Badge>
                          </td>

                          {/* 标题与负责人。悬停显示完整标题和账号。 */}
                          <td
                            data-col-key="title"
                            className={cn(
                              "sticky left-[61px] z-20 shadow-[1px_0_0_0_#E2E2DF] py-2.5 px-3 min-w-[240px] transition-colors",
                              isSelected
                                ? "bg-[#F1F1F0] group-hover:bg-[#EBEBE9]"
                                : "bg-white group-hover:bg-[#F7F7F6] group-active:bg-[#EBEBE9] group-has-[button:focus-visible]:bg-[#F7F7F6]",
                              hoveredColKey === "title" && "bg-surface-row-hover/60",
                            )}
                          >
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <div className="flex items-center gap-1 min-w-0 cursor-default" />
                                }
                              >
                                {/* 标题即键盘入口：此前整行只有 onClick，Tab 走完筛选/排序/分页
                                    永远进不了任何作品，键盘用户主任务做不完（2026-10-11 审计 H4）。
                                    做成真正的 button（不是给 tr 加 tabindex）：语义正确、Enter/Space 原生可用、
                                    也不破坏表格的行列结构。 */}
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    // 行本身也有 onClick：这里阻止冒泡，避免同一次点击触发两遍
                                    event.stopPropagation();
                                    onSelectVideoId(video.id);
                                  }}
                                  aria-label={`查看作品详情：${video.video_title || video.content?.slice(0, 50) || "未命名视频"}${video.accounts?.name ? `（${video.accounts.name}）` : ""}`}
                                  className="truncate text-left text-[14px] font-normal text-[#1F1E1D] group-hover:text-[#141413] transition-colors rounded-sm outline-none focus-visible:underline focus-visible:decoration-[#141413] focus-visible:decoration-2 focus-visible:underline-offset-2 cursor-pointer"
                                >
                                  {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                                </button>
                                {owner.name ? (
                                  <span className="shrink-0 text-[12px] text-[#A8A29E] font-normal truncate max-w-[80px] 2xl:max-w-[110px]">
                                    ·{" "}
                                    {owner.id && onSelectAuthor ? (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          onSelectAuthor(owner.id, owner.name);
                                        }}
                                        className="text-[#78716C] hover:text-[#141413] hover:underline transition-colors cursor-pointer"
                                        title={`查看 ${owner.name} 的全部作品`}
                                      >
                                        {owner.name}
                                      </button>
                                    ) : (
                                      <span className="text-[#78716C]">{owner.name}</span>
                                    )}
                                  </span>
                                ) : null}
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                align="start"
                                sideOffset={4}
                                className="max-w-md p-2 bg-[#1F1E1D] text-white border border-[#333] shadow-claude-float rounded-lg text-left pointer-events-none z-50 text-[12px] leading-relaxed"
                              >
                                <div className=" text-white">{video.video_title || video.content || "未命名视频"}</div>
                                {video.accounts?.name ? (
                                  <div className="text-[12px] text-[#A8A29E] mt-0.5">账号：@{video.accounts.name}</div>
                                ) : null}
                              </TooltipContent>
                            </Tooltip>
                          </td>

                          {/* 播放量：核心视觉锚点，保持 14px 定名墨，单日视图底层带淡雅微型数据条 */}
                          <td data-col-key="play_count" className={cn("relative py-2.5 px-2 text-right tabular-nums font-normal text-[14px] text-[#141413] whitespace-nowrap transition-colors", hoveredColKey === "play_count" && "bg-surface-row-hover/60")}>
                            {isSingleDay && item.playCount && item.playCount > 0 ? (
                              <div
                                aria-hidden="true"
                                className="absolute inset-y-1 right-1 rounded-md bg-status-info/[0.08] pointer-events-none"
                                style={{ width: `calc(${Math.min((item.playCount / maxPlayCount) * 100, 100).toFixed(1)}% - 8px)` }}
                              />
                            ) : null}
                            <span className="relative z-10">
                              <Highlightable hit={cellHit(item, "playCount")}>{formatCount(item.playCount)}</Highlightable>
                            </span>
                          </td>

                          {/* 涨粉 */}
                          <td data-col-key="follower_gain" className={cn("py-2.5 px-2 text-right tabular-nums text-[#1F1E1D] whitespace-nowrap transition-colors", hoveredColKey === "follower_gain" && "bg-surface-row-hover/60")}>
                            <Highlightable hit={cellHit(item, "followerGain")}>{formatCount(item.followerGain)}</Highlightable>
                          </td>

                          {/* 完整版专属：点赞、评论、分享、收藏 4 列 */}
                          {!isSpacious && (
                            <>
                              <td data-col-key="likes" className={cn("py-2.5 pl-4 pr-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "likes" && "bg-surface-row-hover/60")}>
                                <Highlightable hit={cellHit(item, "likes")}>{formatCount(item.likes)}</Highlightable>
                              </td>
                              <td data-col-key="comments" className={cn("py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "comments" && "bg-surface-row-hover/60")}>
                                <Highlightable hit={cellHit(item, "comments")}>{formatCount(item.comments)}</Highlightable>
                              </td>
                              <td data-col-key="shares" className={cn("py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "shares" && "bg-surface-row-hover/60")}>
                                <Highlightable hit={cellHit(item, "shares")}>{formatCount(item.shares)}</Highlightable>
                              </td>
                              <td data-col-key="favorites" className={cn("py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "favorites" && "bg-surface-row-hover/60")}>
                                <Highlightable hit={cellHit(item, "favorites")}>{formatCount(item.favorites)}</Highlightable>
                              </td>
                            </>
                          )}

                          {/* 完播指标 (2s跳出、5s完播、均播、播放占比、完播) */}
                          <td data-col-key="bounce_rate_2s" className={cn("py-2.5 pl-4 pr-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "bounce_rate_2s" && "bg-surface-row-hover/60")}>
                            <RatioCell standards={evaluationStandards} value={item.bounceRate2s} lowSample={item.lowSample} metricType="bounce_rate_2s" className={cellHit(item, "bounceRate2s") ? HIGHLIGHT_CELL_CLASS : ""} />
                          </td>
                          <td data-col-key="completion_rate_5s" className={cn("py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "completion_rate_5s" && "bg-surface-row-hover/60")}>
                            <RatioCell standards={evaluationStandards} value={item.completionRate5s} lowSample={item.lowSample} metricType="completion_rate_5s" className={cellHit(item, "completionRate5s") ? HIGHLIGHT_CELL_CLASS : ""} />
                          </td>
                          <td data-col-key="avg_play_duration" className={cn("py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "avg_play_duration" && "bg-surface-row-hover/60")}>
                            <DurationCell standards={evaluationStandards} value={item.avgPlayDuration} lowSample={item.lowSample} className={cellHit(item, "avgPlayDuration") ? HIGHLIGHT_CELL_CLASS : ""} />
                          </td>
                          <td data-col-key="avg_play_ratio" className={cn("py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "avg_play_ratio" && "bg-surface-row-hover/60")}>
                            <RatioCell standards={evaluationStandards} value={item.avgPlayRatio} lowSample={item.lowSample} metricType="avg_play_ratio" />
                          </td>
                          {/* 完播率：单日视图底层带淡雅微型数据条（排除低样本干扰） */}
                          <td data-col-key="completion_rate" className={cn("relative py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "completion_rate" && "bg-surface-row-hover/60")}>
                            {isSingleDay && item.completionRate && item.completionRate > 0 ? (
                              <div
                                aria-hidden="true"
                                className="absolute inset-y-1 right-1 rounded-md bg-[#141413]/[0.06] pointer-events-none"
                                style={{ width: `calc(${Math.min((item.completionRate / maxCompletionRate) * 100, 100).toFixed(1)}% - 8px)` }}
                              />
                            ) : null}
                            <span className="relative z-10">
                              <RatioCell standards={evaluationStandards} value={item.completionRate} lowSample={item.lowSample} metricType="completion_rate" className={cellHit(item, "completionRate") ? HIGHLIGHT_CELL_CLASS : ""} />
                            </span>
                          </td>

                          {/* 核心指标（排在互动率前面） */}
                          <td data-col-key="core_metric" className={cn("py-2.5 px-2 text-right whitespace-nowrap tabular-nums transition-colors", hoveredColKey === "core_metric" && "bg-surface-row-hover/60")}>
                            {item.quality?.status === "rated" && item.coreMetricTopicText ? (
                              <span
                                className={cn("relative text-[13px] font-normal", getCoreAchievementClass(item.quality.coreAchievement, item.playCount, evaluationStandards) || "text-[#1F1E1D]")}
                                title={`${item.coreMetricTopicText}核心指标`}
                                aria-label={`${item.coreMetricTopicText}核心指标 ${formatPercent(item.coreMetricRate)}`}
                              >
                                <Highlightable hit={cellHit(item, "coreMetricRate")}>{formatPercent(item.coreMetricRate)}</Highlightable>
                                {item.coreMetricTopicText === "复盘" && item.coreMetricRate != null && (
                                  <span aria-hidden="true" className="absolute -right-1.5 -top-1 text-[12px] leading-none text-[#A8A29E] opacity-70">*</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-[12px] text-[#A8A29E]">—</span>
                            )}
                          </td>

                          {/* 互动率（排在核心指标后面） */}
                          <td data-col-key="interaction_rate" className={cn("py-2.5 px-2 text-right tabular-nums font-normal text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "interaction_rate" && "bg-surface-row-hover/60")}>
                            <RatioCell standards={evaluationStandards} value={item.interactionRate} achievement={item.quality?.interactionAchievement} lowSample={item.lowSample} className={cellHit(item, "interactionRate") ? HIGHLIGHT_CELL_CLASS : ""} />
                          </td>

                          {/* 发布时间（单日显示 HH:mm，多日显示 MM-DD；统一在最右侧末尾） */}
                          <td
                            data-col-key="published_at"
                            className={cn("py-2.5 px-1 text-right tabular-nums text-[#1F1E1D] text-[12px] whitespace-nowrap transition-colors", hoveredColKey === "published_at" && "bg-surface-row-hover/60")}
                            title={video.published_at ?? "发布日期未知"}
                          >
                            {isSingleDay ? formatTimeOfDay(video.published_at) : formatCompactDate(video.published_at)}
                          </td>
                        </tr>
                      );
                    })
                  )}

                </tbody>
              </Table>
            </Card>
      </div>
    </TooltipProvider>
  );
}
