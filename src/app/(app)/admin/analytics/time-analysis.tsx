"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, Flame, Info, MousePointer2, Pin, XCircle } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

import { buildTimeAnalysisSummary, type TimeAnalysisCell, type TimeAnalysisReport } from "./time-analysis-utils";

interface TimeAnalysisProps {
  reports: TimeAnalysisReport[];
}

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const HOURS = Array.from({ length: 24 }, (_, index) => index);

interface ActiveCell {
  weekdayIndex: number;
  hour: number;
}

type ConfidenceLevel = "高" | "中" | "低";

function buildEmptyStateDescription(summary: ReturnType<typeof buildTimeAnalysisSummary>) {
  if (summary.totalWithPlay === 0) {
    return "当前筛选范围内没有可用于时间分析的播放数据。";
  }

  const reasons: string[] = [];

  if (summary.missingPublishedAtCount > 0) {
    reasons.push(`${summary.missingPublishedAtCount} 条缺少发布时间`);
  }

  if (summary.invalidPublishedAtCount > 0) {
    reasons.push(`${summary.invalidPublishedAtCount} 条发布时间格式异常`);
  }

  if (reasons.length === 0) {
    return "当前筛选范围内没有可用于生成时间热力图的发布时间数据。";
  }

  return `当前范围内的样本无法生成时间热力图：${reasons.join("，")}。`;
}

function formatPlayCount(value: number | null) {
  if (value === null) return "—";
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return value.toLocaleString("zh-CN");
}

function formatHourRange(hour: number) {
  return `${String(hour).padStart(2, "0")}:00 - ${String(hour).padStart(2, "0")}:59`;
}

function formatWindowRange(weekdayIndex: number, hour: number) {
  return `${WEEKDAYS[weekdayIndex]} ${String(hour).padStart(2, "0")}:00 - ${String(hour + 2).padStart(2, "0")}:59`;
}

function getIntensityClass(value: number | null, max: number) {
  if (value === null || value === 0 || max <= 0) {
    return "border-slate-200/80 bg-slate-50/85";
  }

  const ratio = value / max;
  if (ratio > 0.85) return "border-rose-400/60 bg-[linear-gradient(135deg,#fb7185_0%,#e11d48_100%)] text-white shadow-[0_8px_18px_rgba(244,63,94,0.22)]";
  if (ratio > 0.65) return "border-rose-300/70 bg-rose-300/85 text-rose-950";
  if (ratio > 0.45) return "border-rose-200/80 bg-rose-200/85 text-rose-950";
  if (ratio > 0.2) return "border-rose-100 bg-rose-100/85 text-rose-900";
  return "border-orange-100 bg-orange-50/90 text-orange-900";
}

function findPreferredCell(
  grid: TimeAnalysisCell[][],
  bestWindow: { w: number; h: number; score: number },
) {
  if (bestWindow.w !== -1) {
    let candidate: ActiveCell | null = null;
    let candidateMedian = -1;

    for (let offset = 0; offset < 3; offset += 1) {
      const hour = bestWindow.h + offset;
      const cell = grid[bestWindow.w][hour];

      if (cell.count > 0 && (cell.medianPlay ?? -1) > candidateMedian) {
        candidate = { weekdayIndex: bestWindow.w, hour };
        candidateMedian = cell.medianPlay ?? -1;
      }
    }

    if (candidate) return candidate;
  }

  let fallback: ActiveCell | null = null;
  let bestMedian = -1;

  for (let weekdayIndex = 0; weekdayIndex < grid.length; weekdayIndex += 1) {
    for (let hour = 0; hour < grid[weekdayIndex].length; hour += 1) {
      const cell = grid[weekdayIndex][hour];
      if (cell.count > 0 && (cell.medianPlay ?? -1) > bestMedian) {
        fallback = { weekdayIndex, hour };
        bestMedian = cell.medianPlay ?? -1;
      }
    }
  }

  return fallback;
}

function isBestWindowCell(
  bestWindow: { w: number; h: number; score: number },
  weekdayIndex: number,
  hour: number,
) {
  return bestWindow.w === weekdayIndex && hour >= bestWindow.h && hour < bestWindow.h + 3;
}

function getExcludedReasonList(summary: ReturnType<typeof buildTimeAnalysisSummary>) {
  const items: string[] = [];

  if (summary.missingPublishedAtCount > 0) {
    items.push(`${summary.missingPublishedAtCount} 条缺少发布时间`);
  }

  if (summary.invalidPublishedAtCount > 0) {
    items.push(`${summary.invalidPublishedAtCount} 条发布时间格式异常`);
  }

  return items;
}

function getWindowStats(
  grid: TimeAnalysisCell[][],
  bestWindow: { w: number; h: number; score: number },
) {
  if (bestWindow.w === -1) {
    return {
      count: 0,
      totalPlay: 0,
      medianPeak: null as number | null,
    };
  }

  let count = 0;
  let totalPlay = 0;
  let medianPeak: number | null = null;

  for (let offset = 0; offset < 3; offset += 1) {
    const cell = grid[bestWindow.w][bestWindow.h + offset];
    count += cell.count;
    totalPlay += cell.totalPlay;
    if (cell.medianPlay !== null) {
      medianPeak = medianPeak === null ? cell.medianPlay : Math.max(medianPeak, cell.medianPlay);
    }
  }

  return { count, totalPlay, medianPeak };
}

function getRecommendationMeta(
  summary: ReturnType<typeof buildTimeAnalysisSummary>,
) {
  if (summary.bestWindow.w === -1) {
    return {
      hasRecommendation: false,
      confidence: null as ConfidenceLevel | null,
      title: "暂无强推荐窗口",
      description: "当前没有任何连续 3 小时窗口累计达到 3 条有效样本，暂时无法给出稳定推荐。",
    };
  }

  const windowStats = getWindowStats(summary.grid, summary.bestWindow);
  const sampleShare = summary.totalEligible > 0 ? windowStats.count / summary.totalEligible : 0;
  const confidence: ConfidenceLevel =
    summary.bestWindow.confidence === "high"
      ? windowStats.count >= 8 || sampleShare >= 0.2
        ? "高"
        : "中"
      : "低";

  const descriptionByConfidence: Record<ConfidenceLevel, string> = {
    高: "推荐窗口内样本覆盖较充分，且集中在同一时段，可优先作为排期基准。",
    中: "推荐窗口已有一定样本支撑，适合优先测试，并结合相邻时段继续观察稳定性。",
    低: "推荐窗口已满足最低样本门槛，但样本还不够厚，建议把它视为试投方向而非最终结论。",
  };

  return {
    hasRecommendation: true,
    confidence,
    title: formatWindowRange(summary.bestWindow.w, summary.bestWindow.h),
    description: descriptionByConfidence[confidence],
    windowStats,
  };
}

function buildCellDescription(
  cell: TimeAnalysisCell,
  isRecommended: boolean,
  maxMedianPlay: number,
) {
  if (cell.count === 0) {
    return "这个时段当前没有有效样本，建议查看相邻时段或优先参考推荐窗口。";
  }

  if (isRecommended) {
    return "这个时段位于当前推荐窗口内，样本量和播放表现都相对更值得优先验证。";
  }

  if ((cell.medianPlay ?? 0) >= maxMedianPlay * 0.8) {
    return "这个时段的播放中位数已经接近全局高位，可以和推荐窗口一起做 AB 对比。";
  }

  if (cell.count >= 3) {
    return "这个时段已有一定样本基础，但整体表现仍需和推荐窗口对照判断稳定性。";
  }

  return "这个时段有少量样本，可作为补充观察点，但暂时不建议单独据此定排期。";
}

export function TimeAnalysis({ reports }: TimeAnalysisProps) {
  const heatmapData = useMemo(() => buildTimeAnalysisSummary(reports), [reports]);
  const preferredCell = useMemo(
    () => findPreferredCell(heatmapData.grid, heatmapData.bestWindow),
    [heatmapData.bestWindow, heatmapData.grid],
  );
  const excludedReasons = useMemo(() => getExcludedReasonList(heatmapData), [heatmapData]);
  const recommendationMeta = useMemo(() => getRecommendationMeta(heatmapData), [heatmapData]);
  const [selectedCell, setSelectedCell] = useState<ActiveCell | null>(null);
  const [hoveredCell, setHoveredCell] = useState<ActiveCell | null>(null);

  if (heatmapData.totalEligible === 0) {
    return (
      <EmptyState
        icon={Clock3}
        title="暂无有效发布时间数据"
        description={buildEmptyStateDescription(heatmapData)}
      />
    );
  }

  const activeCell = hoveredCell ?? selectedCell ?? preferredCell;
  const activeSummary = activeCell
    ? heatmapData.grid[activeCell.weekdayIndex][activeCell.hour]
    : null;
  const excludedCount = heatmapData.missingPublishedAtCount + heatmapData.invalidPublishedAtCount;
  const recommendationWindowStats =
    "windowStats" in recommendationMeta ? recommendationMeta.windowStats : null;
  const activeIsRecommended = activeCell
    ? isBestWindowCell(heatmapData.bestWindow, activeCell.weekdayIndex, activeCell.hour)
    : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">时间维度分析</h3>
          <p className="max-w-2xl text-sm text-[var(--color-text-secondary)]">
            保留 7 x 24 热力图结构，用播放中位数观察一周内各发布时间的表现；悬停可预览，点击可锁定右侧详情。
          </p>
        </div>

        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border px-5 py-4 shadow-[0_2px_10px_rgba(225,29,72,0.06)] backdrop-blur-sm",
            recommendationMeta.hasRecommendation
              ? "border-rose-200/60 bg-[linear-gradient(135deg,rgba(255,241,242,0.86)_0%,rgba(255,228,230,0.6)_100%)]"
              : "border-slate-200 bg-[linear-gradient(135deg,rgba(248,250,252,0.95)_0%,rgba(241,245,249,0.86)_100%)]",
          )}
        >
          <div
            className={cn(
              "absolute -right-5 -top-5 size-20 rounded-full blur-2xl",
              recommendationMeta.hasRecommendation ? "bg-rose-500/10" : "bg-slate-400/10",
            )}
          />
          <div className="relative space-y-1">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-11 items-center justify-center rounded-full shadow-inner",
                  recommendationMeta.hasRecommendation ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500",
                )}
              >
                {recommendationMeta.hasRecommendation ? <Flame className="size-5" /> : <Clock3 className="size-5" />}
              </div>
              <div>
                <p
                  className={cn(
                    "text-[11px] font-bold tracking-[0.18em]",
                    recommendationMeta.hasRecommendation ? "text-rose-500" : "text-slate-500",
                  )}
                >
                  {recommendationMeta.hasRecommendation ? "推荐发布时间窗口" : "推荐状态"}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-base font-black tracking-tight",
                    recommendationMeta.hasRecommendation ? "text-rose-950" : "text-slate-800",
                  )}
                >
                  {recommendationMeta.title}
                </p>
              </div>
            </div>
            <p className="text-sm leading-6 text-slate-600">{recommendationMeta.description}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="rounded-[28px] border border-white/65 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(248,250,252,0.84))] p-5 shadow-[var(--shadow-card)] backdrop-blur-[18px] sm:p-6">
          <div className="mb-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-[var(--shadow-light)]">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400">有效样本数</p>
              <p className="mt-1 text-xl font-bold text-slate-950">{heatmapData.totalEligible}</p>
              <p className="mt-1 text-xs text-slate-500">已同时具备播放数据和可解析发布时间</p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-[var(--shadow-light)]">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400">未纳入统计数</p>
              <p className="mt-1 text-xl font-bold text-slate-950">{excludedCount}</p>
              <p className="mt-1 text-xs text-slate-500">
                {excludedReasons.length > 0 ? excludedReasons.join("；") : "当前无排除样本"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-[var(--shadow-light)]">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400">推荐窗口置信度</p>
              <p className="mt-1 text-xl font-bold text-slate-950">
                {recommendationMeta.confidence ? recommendationMeta.confidence : "暂无"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {recommendationMeta.hasRecommendation && recommendationWindowStats
                  ? `基于连续 3 小时窗口内 ${recommendationWindowStats.count} 条样本推断`
                  : "未达到稳定推荐所需的最低窗口样本"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-[var(--shadow-light)]">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-400">最高播放中位数</p>
              <p className="mt-1 text-xl font-bold text-slate-950">{formatPlayCount(heatmapData.maxMedianPlay || null)}</p>
              <p className="mt-1 text-xs text-slate-500">用于定义热力图颜色强弱</p>
            </div>
          </div>

          <div className="mb-5 rounded-2xl border border-slate-200/80 bg-slate-50/75 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">推荐窗口说明</p>
                <p className="text-sm leading-6 text-slate-600">{recommendationMeta.description}</p>
              </div>
              {recommendationMeta.hasRecommendation ? (
                <div className="rounded-xl border border-rose-200/80 bg-white/90 px-4 py-3 text-sm shadow-[var(--shadow-light)]">
                  <p className="font-semibold text-slate-900">{recommendationMeta.title}</p>
                  <p className="mt-1 text-slate-500">
                    窗口样本 {recommendationWindowStats?.count ?? 0} 条，窗口总播放{" "}
                    {formatPlayCount(recommendationWindowStats?.totalPlay ?? null)}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm text-slate-500 shadow-[var(--shadow-light)]">
                  没有强推荐的原因：连续 3 小时内还没有累计到足够多的有效样本。
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="min-w-[760px]">
              <div
                className="mb-3 grid items-center gap-2"
                style={{ gridTemplateColumns: "72px repeat(24, minmax(20px, 1fr))" }}
              >
                <div />
                {HOURS.map((hour) => (
                  <div key={hour} className="text-center text-[11px] font-semibold text-slate-400">
                    {hour % 2 === 0 ? String(hour).padStart(2, "0") : ""}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {WEEKDAYS.map((day, weekdayIndex) => (
                  <div
                    key={day}
                    className="grid items-center gap-2"
                    style={{ gridTemplateColumns: "72px repeat(24, minmax(20px, 1fr))" }}
                  >
                    <div className="pr-2 text-sm font-semibold text-slate-600">{day}</div>
                    {HOURS.map((hour) => {
                      const cell = heatmapData.grid[weekdayIndex][hour];
                      const isPreview =
                        hoveredCell?.weekdayIndex === weekdayIndex && hoveredCell?.hour === hour;
                      const isPinned =
                        selectedCell?.weekdayIndex === weekdayIndex && selectedCell?.hour === hour;
                      const isActive =
                        activeCell?.weekdayIndex === weekdayIndex && activeCell?.hour === hour;
                      const isWindowCell = isBestWindowCell(heatmapData.bestWindow, weekdayIndex, hour);

                      return (
                        <button
                          key={`${day}-${hour}`}
                          type="button"
                          onMouseEnter={() => setHoveredCell({ weekdayIndex, hour })}
                          onMouseLeave={() => setHoveredCell(null)}
                          onFocus={() => setHoveredCell({ weekdayIndex, hour })}
                          onBlur={() => setHoveredCell(null)}
                          onClick={() =>
                            setSelectedCell((current) =>
                              current?.weekdayIndex === weekdayIndex && current?.hour === hour
                                ? null
                                : { weekdayIndex, hour },
                            )
                          }
                          className={cn(
                            "group relative aspect-square min-h-6 rounded-[10px] border transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                            getIntensityClass(cell.medianPlay, heatmapData.maxMedianPlay),
                            cell.count > 0 ? "hover:-translate-y-0.5 hover:shadow-md" : "opacity-65 hover:opacity-80",
                            isWindowCell && "ring-1 ring-rose-300/90 ring-offset-1 ring-offset-white",
                            isPreview && "scale-[1.03] shadow-md",
                            isPinned && "ring-2 ring-slate-900/70 ring-offset-2 ring-offset-white",
                            isActive && !isPinned && "ring-2 ring-slate-400/55 ring-offset-2 ring-offset-white",
                          )}
                          aria-pressed={isPinned}
                          aria-label={`${day}${formatHourRange(hour)}，样本 ${cell.count} 条，播放中位数 ${formatPlayCount(cell.medianPlay)}`}
                        >
                          {isPinned ? (
                            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-slate-900/75" />
                          ) : null}
                          <span className="sr-only">{`${day}${formatHourRange(hour)}`}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/75 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-3 rounded bg-slate-100 ring-1 ring-slate-200" />
                低
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex size-3 rounded bg-rose-200 ring-1 ring-rose-200" />
                中
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex size-3 rounded bg-rose-500 ring-1 ring-rose-400" />
                高
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex size-3 rounded border-2 border-slate-900/70 bg-white" />
                点击锁定
              </div>
            </div>
            <p className="text-xs text-slate-500">
              热力颜色看播放中位数，玫瑰色描边表示它位于推荐窗口内。
            </p>
          </div>
        </section>

        <aside className="space-y-4 rounded-[28px] border border-slate-200/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(245,247,250,0.92))] p-5 shadow-[var(--shadow-card)] backdrop-blur-[18px] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-slate-400">
              <MousePointer2 className="size-3.5" />
              时段详情
            </div>
            {selectedCell ? (
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-xs text-slate-500">
                <Pin className="size-3" />
                已锁定
              </div>
            ) : null}
          </div>

          {activeCell && activeSummary ? (
            <>
              <div className="space-y-2">
                <div
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                    activeIsRecommended
                      ? "border border-rose-200/80 bg-rose-50/90 text-rose-600"
                      : "border border-slate-200/80 bg-slate-50 text-slate-600",
                  )}
                >
                  {activeIsRecommended ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                  {activeIsRecommended ? "属于推荐窗口" : "不属于推荐窗口"}
                </div>
                <div>
                  <h4 className="text-2xl font-black tracking-tight text-slate-950">
                    {WEEKDAYS[activeCell.weekdayIndex]}
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">{formatHourRange(activeCell.hour)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[var(--shadow-light)]">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">当前时段</p>
                  <p className="mt-2 text-lg font-bold text-slate-950">
                    {WEEKDAYS[activeCell.weekdayIndex]} {formatHourRange(activeCell.hour)}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[var(--shadow-light)]">
                    <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">样本数</p>
                    <p className="mt-2 text-2xl font-bold text-slate-950">{activeSummary.count} 条</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[var(--shadow-light)]">
                    <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">播放中位数</p>
                    <p className="mt-2 text-2xl font-bold text-slate-950">{formatPlayCount(activeSummary.medianPlay)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[var(--shadow-light)] sm:col-span-2 xl:col-span-1">
                    <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">总播放</p>
                    <p className="mt-2 text-2xl font-bold text-slate-950">{formatPlayCount(activeSummary.totalPlay)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">一句解释</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {buildCellDescription(activeSummary, activeIsRecommended, heatmapData.maxMedianPlay)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
                  {selectedCell ? "再次点击当前格子可取消锁定，恢复为悬停预览模式。" : "当前未锁定时段，点击热力格可固定查看。"}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-5 text-sm text-slate-600">
              点击任意热力单元格查看该时段表现。
            </div>
          )}
        </aside>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-blue-100/50 bg-blue-50/50 p-3 text-sm text-blue-800">
        <Info className="mt-0.5 size-4 shrink-0 text-blue-500" />
        <p className="leading-relaxed text-[13px]">
          热力图基于历史发布时间数据的<strong className="mx-0.5 font-semibold">播放量中位数</strong>
          生成。为了避免时区偏移影响发布时间语义，这里按样本记录里的原始发布时间时段进行统计；缺少或无法解析发布时间的样本不会被纳入分析。推荐窗口置信度为前端展示层推断，用于帮助判断参考强弱，不会改动底层算法结论。
        </p>
      </div>
    </div>
  );
}
