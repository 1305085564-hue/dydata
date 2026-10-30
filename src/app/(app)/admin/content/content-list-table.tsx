import { getContentOwner } from "@/lib/content/content-owner";
import { getCoreAchievementClass } from "@/lib/content/domain/detail";
import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { describeImpossibleRatio, isImpossibleRatio } from "@/lib/metric-bounds";
import { DEFAULT_EVALUATION_STANDARDS, EVALUATION_METRICS, evaluationTone, type EvaluationMetric, type EvaluationStandards } from "@/lib/evaluation-standards";
import { getStatusDot, type SortField } from "@/lib/content/domain/content-list";
import {
  HIGHLIGHT_CELL_CLASS,
  isCellHighlighted,
  type HighlightFieldKey,
  type HighlightRuleMap,
} from "@/lib/content/domain/content-list-highlight";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import { ContentListTableHeader } from "./content-list-table-header";

function formatCount(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  if (absVal >= 100000000) {
    const num = (absVal / 100000000).toFixed(1).replace(/\.0$/, "");
    return `${isNegative ? "-" : ""}${num}亿`;
  }
  if (absVal >= 10000) {
    const num = (absVal / 10000).toFixed(1).replace(/\.0$/, "");
    return `${isNegative ? "-" : ""}${num}万`;
  }
  return String(val);
}

function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${val.toFixed(1)}%`;
}
/** 比率类指标（完播率 / 2s 跳出 / 互动率）物理上限 100%，下限 0%。
 *  越界说明上游采集或入库有脏数据：显示时照原值打出并打脏值标记（不掩盖问题），
 *  但排序时必须按无效值处理，否则「点表头找最差」会被一条不可能的 4773% 顶到榜首。 */

/** 颜色与提示共用公司标准；越界比率优先显示数据异常。 */
function RatioCell({ value, lowSample = false, metricType, achievement, className = "", standards = DEFAULT_EVALUATION_STANDARDS }: {
  value: number | null | undefined;
  lowSample?: boolean;
  metricType?: "bounce_rate_2s" | "completion_rate_5s" | "completion_rate" | "avg_play_duration";
  achievement?: number | null;
  className?: string;
  standards?: EvaluationStandards;
}) {
  const duration = metricType === "avg_play_duration";
  const dirty = !duration && isImpossibleRatio(value);
  const metric: EvaluationMetric | undefined = metricType === "bounce_rate_2s" ? "bounceRate2s"
    : metricType === "completion_rate_5s" ? "completionRate5s"
    : metricType === "completion_rate" ? "completionRate"
    : duration ? "avgPlayDuration" : achievement != null ? "interactionAchievement" : undefined;
  const tone = metric ? evaluationTone(metric, metric === "interactionAchievement" ? achievement : value, undefined, standards) : "normal";
  const text = duration ? (value == null ? "—" : `${value.toFixed(1)}s`) : formatPercent(value);
  let title: string | undefined;
  let color = "";
  if (dirty) {
    color = "text-status-danger underline decoration-status-danger/60 decoration-dotted underline-offset-2";
    title = describeImpossibleRatio();
  } else if (lowSample) {
    color = "text-[#A8A29E]";
    title = `播放量不足 ${standards.minPlayCount.toLocaleString("zh-CN")}，样本不足，仅供参考`;
  } else if (metric && tone !== "normal") {
    color = tone === "good" ? "text-status-danger" : "text-status-success";
    const meta = EVALUATION_METRICS.find(({ key }) => key === metric)!;
    const operator = metric === "bounceRate2s" ? (tone === "good" ? "≤" : ">") : (tone === "good" ? "≥" : "≤");
    title = `${meta.label} ${operator}${standards[metric][tone]}${meta.unit} ${tone === "good" ? "表现优质" : "需要关注"}`;
  }
  const number = <span className={cn(className, color, title && "cursor-help")}>{text}</span>;
  return title ? <Tooltip><TooltipTrigger render={number} /><TooltipContent>{title}</TooltipContent></Tooltip> : number;
}

function DurationCell(props: Omit<React.ComponentProps<typeof RatioCell>, "metricType">) {
  return <RatioCell {...props} metricType="avg_play_duration" />;
}

/** 命中高亮的数值包一层淡琥珀 span；未命中保持原样，不改变既有配色冲突面 */
function Highlightable({ hit, children }: { hit: boolean; children: React.ReactNode }) {
  if (!hit) return <>{children}</>;
  return <span className={HIGHLIGHT_CELL_CLASS}>{children}</span>;
}

/** 发布时间：单日显示时刻，多日显示月日；固定按北京时间（Asia/Shanghai）格式化，
 *  完整时间通过悬停 title 查看，节省横向空间释放给核心指标等前排数据。 */
function formatCompactDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("month")}-${read("day")}`;
}

/** 单日模式的发布时间：只显示时刻（HH:mm），时区口径与 formatCompactDate 一致 */
function formatTimeOfDay(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("hour")}:${read("minute")}`;
}


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
  onSelectVideoId,
  onSelectAuthor,
  ownerNames,
  highlightRules,
  evaluationStandards = DEFAULT_EVALUATION_STANDARDS,
}: ContentListTableProps) {
  const isSpacious = metricViewMode === "spacious";
  const dynamicColSpan = isSpacious ? 11 : 15;
  const cellHit = (item: ProcessedContentRow, key: HighlightFieldKey) =>
    isCellHighlighted(item, key, highlightRules);
  const [hoveredColKey, setHoveredColKey] = useState<string | null>(null);

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

              return (
                <div
                  key={video.id}
                  onClick={() => onSelectVideoId(video.id)}
                  className="group relative flex flex-col gap-1.5 p-3 hover:bg-[#F7F7F6] active:bg-[#EBEBE9] transition-colors cursor-pointer select-none"
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
                    className="w-full min-h-[44px] flex items-center text-left text-[14px] font-normal text-[#1F1E1D] group-hover:text-[#141413] transition-colors rounded-sm outline-none focus-visible:underline focus-visible:decoration-[#D97757] focus-visible:decoration-2 focus-visible:underline-offset-2 cursor-pointer line-clamp-2 leading-snug py-1"
                  >
                    {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                  </button>

                  {/* 第 3 层：账号与负责人 */}
                  <div className="flex items-center gap-1.5 text-[12px] text-[#78716C] font-normal truncate">
                    {video.accounts?.name && (
                      <span className="truncate">@{video.accounts.name}</span>
                    )}
                    {owner.name && (
                      <span className="shrink-0 text-[#A8A29E]">
                        · 责任人：
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

                  {/* 第 4 层：高密度指标矩阵（播放量、涨粉、完播率、互动率、点赞） */}
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
        <Card
          className="hidden md:block flex-1 w-full overflow-x-auto p-0 gap-0"
        >
              <table className={cn(
                "w-full text-left border-collapse table-fixed",
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
                  className="divide-y divide-[#E2E2DF]/60 text-[14px] text-[#1F1E1D]"
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

                      return (
                        <tr
                          key={video.id}
                          onClick={() => onSelectVideoId(video.id)}
                          className="group hover:bg-[#F7F7F6] active:bg-[#EBEBE9] transition-colors duration-150 cursor-pointer has-[button:focus-visible]:bg-[#F7F7F6]"
                        >
                          {/* 状态徽标（降饱和微标签，消灭悬停猜谜） */}
                          <td data-col-key="status" className={cn("py-2 px-1 text-center shrink-0 transition-colors", hoveredColKey === "status" && "bg-surface-row-hover/60")}>
                            <Badge variant={dot.variant} title={`状态：${dot.label}`}>
                              {dot.label}
                            </Badge>
                          </td>

                          {/* 标题与账号（使用 100ms 快速 Tooltip 悬停即时展示完整标题与账号） */}
                          <td data-col-key="title" className={cn("py-2.5 px-3 min-w-[240px] transition-colors", hoveredColKey === "title" && "bg-surface-row-hover/60")}>
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
                                  className="truncate text-left text-[14px] font-normal text-[#1F1E1D] group-hover:text-[#141413] transition-colors rounded-sm outline-none focus-visible:underline focus-visible:decoration-[#D97757] focus-visible:decoration-2 focus-visible:underline-offset-2 cursor-pointer"
                                >
                                  {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                                </button>
                                {video.accounts?.name ? (
                                  <span className="shrink-0 text-[12px] text-[#78716C] font-normal truncate max-w-[75px] 2xl:max-w-[100px]">
                                    · {video.accounts.name}
                                  </span>
                                ) : null}
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
                                <div className="text-[12px] text-[#A8A29E] mt-0.5 space-x-2">
                                  {video.accounts?.name ? <span>账号：@{video.accounts.name}</span> : null}
                                  {owner.name ? <span>责任人：{owner.name}</span> : null}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </td>

                          {/* 播放量 */}
                          <td data-col-key="play_count" className={cn("py-2.5 px-2 text-right tabular-nums font-normal text-[#1F1E1D] whitespace-nowrap transition-colors", hoveredColKey === "play_count" && "bg-surface-row-hover/60")}>
                            <Highlightable hit={cellHit(item, "playCount")}>{formatCount(item.playCount)}</Highlightable>
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

                          {/* 完播指标 (2s跳出、5s完播、均播、完播) */}
                          <td data-col-key="bounce_rate_2s" className={cn("py-2.5 pl-4 pr-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "bounce_rate_2s" && "bg-surface-row-hover/60")}>
                            <RatioCell standards={evaluationStandards} value={item.bounceRate2s} lowSample={item.lowSample} metricType="bounce_rate_2s" className={cellHit(item, "bounceRate2s") ? HIGHLIGHT_CELL_CLASS : ""} />
                          </td>
                          <td data-col-key="completion_rate_5s" className={cn("py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "completion_rate_5s" && "bg-surface-row-hover/60")}>
                            <RatioCell standards={evaluationStandards} value={item.completionRate5s} lowSample={item.lowSample} metricType="completion_rate_5s" className={cellHit(item, "completionRate5s") ? HIGHLIGHT_CELL_CLASS : ""} />
                          </td>
                          <td data-col-key="avg_play_duration" className={cn("py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "avg_play_duration" && "bg-surface-row-hover/60")}>
                            <DurationCell standards={evaluationStandards} value={item.avgPlayDuration} lowSample={item.lowSample} className={cellHit(item, "avgPlayDuration") ? HIGHLIGHT_CELL_CLASS : ""} />
                          </td>
                          <td data-col-key="completion_rate" className={cn("py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap transition-colors", hoveredColKey === "completion_rate" && "bg-surface-row-hover/60")}>
                            <RatioCell standards={evaluationStandards} value={item.completionRate} lowSample={item.lowSample} metricType="completion_rate" className={cellHit(item, "completionRate") ? HIGHLIGHT_CELL_CLASS : ""} />
                          </td>

                          {/* 核心指标（排在互动率前面） */}
                          <td data-col-key="core_metric" className={cn("py-2.5 px-2 text-right whitespace-nowrap tabular-nums transition-colors", hoveredColKey === "core_metric" && "bg-surface-row-hover/60")}>
                            {item.quality?.status === "rated" && item.coreMetricTopicText ? (
                              <span
                                className={cn("relative text-[14px] font-normal", getCoreAchievementClass(item.quality.coreAchievement, item.playCount, evaluationStandards) || "text-[#1F1E1D]")}
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
              </table>
            </Card>
      </div>
    </TooltipProvider>
  );
}
