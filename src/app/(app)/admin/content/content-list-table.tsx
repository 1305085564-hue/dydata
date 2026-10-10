import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { describeImpossibleRatio, isImpossibleRatio } from "@/lib/metric-bounds";
import { getContentQualityStatusShortText, getContentQualityStatusText } from "@/lib/collaboration/content-quality-contract";
import { BREAKOUT_GRADE_TEXT_CLASS } from "@/lib/breakout-rating";
import { getStatusDot, type SortField } from "@/lib/content/domain/content-list";
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
  return val.toLocaleString("zh-CN");
}

function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${val.toFixed(1)}%`;
}
/** 比率类指标（完播率 / 2s 跳出 / 互动率）物理上限 100%，下限 0%。
 *  越界说明上游采集或入库有脏数据：显示时照原值打出并打脏值标记（不掩盖问题），
 *  但排序时必须按无效值处理，否则「点表头找最差」会被一条不可能的 4773% 顶到榜首。 */

/**
 * 比率单元格：脏值（越界）标红 + 虚线下划线 + tooltip 说明；
 * 样本不足（播放量低于复盘达标线）时整格降灰，提示该比率是噪音而非信号。
 */
function RatioCell({
  value,
  lowSample = false,
  className = "",
}: {
  value: number | null | undefined;
  lowSample?: boolean;
  className?: string;
}) {
  const dirty = isImpossibleRatio(value);
  const text = formatPercent(value);
  const sampleTitle = lowSample ? "播放量低于复盘达标线，样本不足，该比率仅供参考" : undefined;
  if (dirty) {
    return (
      <span
        className={`text-status-danger font-normal underline decoration-status-danger/60 decoration-dotted underline-offset-2 cursor-help ${className}`}
        title={describeImpossibleRatio()}
      >
        {text}
      </span>
    );
  }
  return (
    <span className={lowSample ? `text-[#A8A29E] ${className}` : className} title={sampleTitle}>
      {text}
    </span>
  );
}
function formatDuration(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return `${val.toFixed(1)}s`;
}

/** 发布时间仅展示月日（MM-DD），固定按北京时间（Asia/Shanghai）格式化，
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


type ContentListTableProps = {
  metricViewMode: "full" | "spacious";
  visibleRows: ProcessedContentRow[];
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  emptyTitle: string;
  emptyDescription: string;
  sortField: SortField;
  sortDir: "asc" | "desc";
  handleSort: (field: SortField) => void;
  canReviewContent?: boolean;
  onSelectVideoId: (id: string | null) => void;
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
  canReviewContent,
  onSelectVideoId,
}: ContentListTableProps) {
  const isSpacious = metricViewMode === "spacious";
  const dynamicColSpan = isSpacious ? 12 : 16;

  return (
          <TooltipProvider delay={100}>
            <Card
              ref={tableContainerRef}
              className="flex-1 w-full overflow-x-auto p-0 gap-0"
            >
              <table className={cn(
                "w-full text-left border-collapse table-fixed",
                isSpacious ? "min-w-full" : "min-w-[960px] xl:min-w-full"
              )}>
                {/* 吸顶表头 */}
                <ContentListTableHeader
                  isSpacious={isSpacious}
                  sortField={sortField}
                  sortDir={sortDir}
                  handleSort={handleSort}
                />

                <tbody className="divide-y divide-[#E2E2DF] text-[13px] text-[#1F1E1D]">
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
                      const dot = getStatusDot(video);

                      return (
                        <tr
                          key={video.id}
                          onClick={() => onSelectVideoId(video.id)}
                          className="group hover:bg-[#F7F7F6] active:bg-[#EBEBE9] transition-colors duration-150 cursor-pointer"
                        >
                          {/* 状态徽标（降饱和微标签，消灭悬停猜谜） */}
                          <td className="py-2 px-1 text-center shrink-0">
                            <Badge variant={dot.variant} title={`状态：${dot.label}`}>
                              {dot.label}
                            </Badge>
                          </td>

                          {/* 标题与账号（使用 100ms 快速 Tooltip 悬停即时展示完整标题与账号） */}
                          <td className="py-2.5 px-3 min-w-0">
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <div className="flex items-center gap-1 min-w-0 cursor-default" />
                                }
                              >
                                <span className="truncate text-[13px] font-normal text-[#1F1E1D] group-hover:text-[#141413] transition-colors">
                                  {video.video_title || video.content?.slice(0, 50) || "未命名视频"}
                                </span>
                                {video.accounts?.name ? (
                                  <span className="shrink-0 text-[12px] text-[#78716C] font-normal truncate max-w-[75px] 2xl:max-w-[100px]">
                                    · {video.accounts.name}
                                  </span>
                                ) : null}

                                {/* 选题库入库状态徽章（由后端明确字段提供） */}
                                {canReviewContent && (() => {
                                  const status = (
                                    video as { topic_library_status?: string }
                                  ).topic_library_status;
                                  if (status === "removed") {
                                    return (
                                      <Badge variant="outline" className="shrink-0">
                                        已移出
                                      </Badge>
                                    );
                                  }
                                  if (status === "in_library") {
                                    return (
                                      <Badge variant="success" className="shrink-0">
                                        已入选题库
                                      </Badge>
                                    );
                                  }
                                  return null;
                                })()}
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                align="start"
                                sideOffset={4}
                                className="max-w-md p-2 bg-[#1F1E1D] text-white border border-[#333] shadow-claude-float rounded-lg text-left pointer-events-none z-50 text-[12px] leading-relaxed"
                              >
                                <div className="font-medium text-white">{video.video_title || video.content || "未命名视频"}</div>
                                {video.accounts?.name ? (
                                  <div className="text-[11px] text-[#A8A29E] mt-0.5">账号：@{video.accounts.name}</div>
                                ) : null}
                              </TooltipContent>
                            </Tooltip>
                          </td>

                          {/* 综合评级 */}
                          <td className="py-2.5 px-2 text-center whitespace-nowrap">
                            {item.quality?.overallGrade ? (
                              <span
                                className={`tabular-nums font-normal ${BREAKOUT_GRADE_TEXT_CLASS[item.quality.overallGrade]}`}
                                title={item.quality.contentAchievement != null ? `内容达成率 ${Math.round(item.quality.contentAchievement)}%` : undefined}
                              >
                                综合{item.quality.overallGrade}
                              </span>
                            ) : (
                              <span
                                className="text-[12px] text-[#A8A29E]"
                                title={getContentQualityStatusText(item.quality?.status ?? "pending_snapshot")}
                              >
                                {getContentQualityStatusShortText(item.quality?.status ?? "pending_snapshot")}
                              </span>
                            )}
                          </td>

                          {/* 核心指标（排在互动率前面） */}
                          <td className="py-2.5 px-2 text-right whitespace-nowrap tabular-nums">
                            {item.quality?.status === "rated" && item.coreMetricTopicText ? (
                              <span className="text-[13px] font-normal text-[#1F1E1D]">
                                <span className="text-[12px] text-[#78716C] mr-1">{item.coreMetricTopicText}</span>
                                {formatPercent(item.coreMetricRate)}
                              </span>
                            ) : (
                              <span className="text-[12px] text-[#A8A29E]">—</span>
                            )}
                          </td>

                          {/* 互动率（排在核心指标后面） */}
                          <td className="py-2.5 px-2 text-right tabular-nums font-normal text-[#78716C] whitespace-nowrap">
                            <RatioCell value={item.interactionRate} lowSample={item.lowSample} />
                          </td>

                          {/* 播放量 */}
                          <td className="py-2.5 px-2 text-right tabular-nums font-normal text-[#1F1E1D] whitespace-nowrap">
                            {formatCount(item.playCount)}
                          </td>

                          {/* 涨粉 */}
                          <td className="py-2.5 px-2 text-right tabular-nums text-[#1F1E1D] whitespace-nowrap">
                            {formatCount(item.followerGain)}
                          </td>

                          {/* 完整版专属：点赞、评论、分享、收藏 4 列 */}
                          {!isSpacious && (
                            <>
                              <td className="py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                                {formatCount(item.likes)}
                              </td>
                              <td className="py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                                {formatCount(item.comments)}
                              </td>
                              <td className="py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                                {formatCount(item.shares)}
                              </td>
                              <td className="py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                                {formatCount(item.favorites)}
                              </td>
                            </>
                          )}

                          {/* 完播指标 (2s跳出、5s完播、均播、完播) */}
                          <td className="py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                            <RatioCell value={item.bounceRate2s} lowSample={item.lowSample} />
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                            <RatioCell value={item.completionRate5s} lowSample={item.lowSample} />
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap" title={item.lowSample ? "播放量低于复盘达标线，均播时长样本不足" : undefined}>
                            <span className={item.lowSample ? "text-[#A8A29E]" : undefined}>
                              {formatDuration(item.avgPlayDuration)}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-[#78716C] whitespace-nowrap">
                            <RatioCell value={item.completionRate} lowSample={item.lowSample} />
                          </td>

                          {/* 发布时间（仅展示MM-DD日期，统一移至最右侧末尾） */}
                          <td
                            className="py-2.5 pl-2 pr-4 text-right tabular-nums text-[#1F1E1D] text-[12px] whitespace-nowrap"
                            title={video.published_at ?? "发布日期未知"}
                          >
                            {formatCompactDate(video.published_at)}
                          </td>
                        </tr>
                      );
                    })
                  )}

                </tbody>
              </table>
            </Card>
          </TooltipProvider>

  );
}
