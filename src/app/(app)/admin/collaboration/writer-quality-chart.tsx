"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import type { DotItemDotProps, ActiveDotProps, MouseHandlerDataParam } from "recharts";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  CHART_AXIS_TICK,
  CHART_GRID_PROPS,
} from "@/lib/chart-palette";
import { BREAKOUT_GRADE_TEXT_CLASS, type BreakoutGrade } from "@/lib/breakout-rating";
import {
  getContentQualityStatusText,
  type ContentQualityRules,
  type ContentQualityStatus,
  type ContentQualitySummary,
} from "@/lib/collaboration/content-quality-contract";
import { CollaborationDiagnosisContext } from "@/components/admin/collaboration-work-review-link";
import { formatBigNumber, type PersonGrowthWorkItem } from "./types";

export interface WriterChartWorkPoint {
  index: number;
  reportId: string;
  videoId: string | null;
  title: string;
  accountName: string;
  reportDate: string;
  playCount: number;
  hasSnapshot: boolean;
  topicKind: "dry_goods" | "review" | "other" | null;
  coreMetric: "favoriteRate" | "likeRate" | null;
  contentAchievement: number | null;
  interactionAchievement: number | null;
  coreAchievement: number | null;
  contentGrade: BreakoutGrade | null;
  overallGrade: BreakoutGrade | null;
  status: ContentQualityStatus;
  pendingPoint: number | null;
}

interface WriterGrowthTooltipBridgeProps {
  active?: boolean;
  payload?: Array<{ payload?: WriterChartWorkPoint }>;
  onHover?: (point: WriterChartWorkPoint) => void;
}

function WriterGrowthTooltipBridge({ active, payload, onHover }: WriterGrowthTooltipBridgeProps) {
  useEffect(() => {
    if (active && payload && payload.length > 0 && payload[0]?.payload) {
      onHover?.(payload[0].payload);
    }
  }, [active, payload, onHover]);

  return null;
}

function resolveWriterChartPoint(
  state: MouseHandlerDataParam | null | undefined,
  data: WriterChartWorkPoint[],
): WriterChartWorkPoint | null {
  if (!state || data.length === 0) return null;

  const rawIdx = state.activeTooltipIndex ?? state.activeIndex;
  if (rawIdx != null) {
    const num = typeof rawIdx === "number" ? rawIdx : Number(rawIdx);
    if (!isNaN(num) && num >= 0 && num < data.length) {
      return data[num];
    }
  }

  if (state.activeLabel != null) {
    const found = data.find((w) => w.reportId === state.activeLabel);
    if (found) return found;
  }

  return null;
}

export interface WriterQualityChartProps {
  works: PersonGrowthWorkItem[];
  summary?: ContentQualitySummary | null;
  rules?: ContentQualityRules;
  state?: "ready" | "error";
  isQualityReady?: boolean;
}

export function WriterQualityChart({
  works,
  summary,
  rules,
  state = "ready",
  isQualityReady = true,
}: WriterQualityChartProps) {
  const diagnosisContext = useContext(CollaborationDiagnosisContext);
  const [hoveredWork, setHoveredWork] = useState<WriterChartWorkPoint | null>(null);

  const [visibleMetrics, setVisibleMetrics] = useState({
    content: true,
    interaction: true,
    core: true,
  });

  const toggleMetric = (key: "content" | "interaction" | "core") => {
    setVisibleMetrics((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const chartData = useMemo<WriterChartWorkPoint[]>(() => {
    return works.map((work, idx) => {
      const q = work.contentQuality;
      const isRated = q?.status === "rated";
      const status: ContentQualityStatus =
        q?.status ??
        (!work.hasSnapshot
          ? "pending_snapshot"
          : !work.videoId
            ? "unlinked"
            : "missing_metrics");

      return {
        index: idx,
        reportId: work.reportId,
        videoId: work.videoId,
        title: work.title,
        accountName: work.accountName,
        reportDate: work.reportDate,
        playCount: work.playCount,
        hasSnapshot: work.hasSnapshot,
        topicKind: q?.topicKind ?? null,
        coreMetric: q?.coreMetric ?? null,
        // 达成率：真 0% 正常保留数值 0 并连线，缺失或未评级为 null 断线
        contentAchievement: isRated && q?.contentAchievement != null ? q.contentAchievement : null,
        interactionAchievement:
          isRated && q?.interactionAchievement != null ? q.interactionAchievement : null,
        coreAchievement: isRated && q?.coreAchievement != null ? q.coreAchievement : null,
        contentGrade: isRated ? (q?.contentGrade ?? null) : null,
        overallGrade: isRated ? (q?.overallGrade ?? null) : null,
        status,
        // 待采集点（无快照）在基线保留中性点标记，但不连入主折线
        pendingPoint: status === "pending_snapshot" ? 0 : null,
      };
    });
  }, [works]);

  const renderPendingDot = (props: DotItemDotProps | ActiveDotProps, active: boolean) => {
    const { cx, cy } = props;
    if (cx == null || cy == null) return null;
    const ink = active ? "#78716C" : "#A8A29E";
    return (
      <g
        className={diagnosisContext ? "cursor-pointer" : undefined}
        onClick={() => {
          if (hoveredWork?.reportId && diagnosisContext) {
            void diagnosisContext.openDiagnosisByReportId(hoveredWork.reportId);
          }
        }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={active ? 6 : 4}
          fill="#FFFFFF"
          stroke={ink}
          strokeWidth={active ? 2 : 1.5}
          strokeDasharray={active ? undefined : "2 2"}
        />
        <circle cx={cx} cy={cy} r={active ? 2 : 1.5} fill={ink} />
      </g>
    );
  };

  const renderCustomDot = (
    props: DotItemDotProps | ActiveDotProps,
    color: string,
    active: boolean,
  ) => {
    const { cx, cy } = props;
    if (cx == null || cy == null) return null;
    return (
      <g
        className={diagnosisContext ? "cursor-pointer" : undefined}
        onClick={() => {
          if (hoveredWork?.reportId && diagnosisContext) {
            void diagnosisContext.openDiagnosisByReportId(hoveredWork.reportId);
          }
        }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={active ? 5 : 3.5}
          fill="#FFFFFF"
          stroke={color}
          strokeWidth={active ? 2 : 1.5}
        />
        <circle cx={cx} cy={cy} r={active ? 2.5 : 1.5} fill={color} />
      </g>
    );
  };

  // 话题标签文案
  const getTopicLabel = (topicKind: string | null, coreMetric: string | null) => {
    if (topicKind === "dry_goods") return "干货 · 收藏";
    if (topicKind === "review") return "复盘 · 点赞";
    if (topicKind === "other") return "其他 · 点赞";
    if (coreMetric === "favoriteRate") return "干货 · 收藏";
    if (coreMetric === "likeRate") return "复盘 · 点赞";
    return "未识别话题";
  };

  return (
    <Card className="p-4 gap-2">
      {/* 头部标题与图例胶囊 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] font-normal text-[#1F1E1D] shrink-0">
            近 30 天作品质量增长曲线
          </span>
          <span className="rounded-md bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] font-normal text-[#78716C] shrink-0">
            文案 · {chartData.length}篇
          </span>
          {!isQualityReady && (
            <span className="rounded-md bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] font-normal text-[#A8A29E] shrink-0">
              目标数据未接入
            </span>
          )}
        </div>

        {chartData.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleMetric("content")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] transition-colors cursor-pointer border ${
                visibleMetrics.content
                  ? "bg-[#D97757]/10 border-[#D97757]/30 text-[#D97757]"
                  : "bg-transparent border-[#E2E2DF] text-[#A8A29E] hover:text-[#78716C]"
              }`}
              title="点击切换两项内容达成率主折线显隐"
            >
              <span
                className="size-1.5 rounded-full"
                style={{
                  backgroundColor: visibleMetrics.content ? "#D97757" : "#A8A29E",
                }}
              />
              <span>内容达成率</span>
            </button>
            <button
              type="button"
              onClick={() => toggleMetric("interaction")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] transition-colors cursor-pointer border ${
                visibleMetrics.interaction
                  ? "bg-[#43718E]/10 border-[#43718E]/30 text-[#43718E]"
                  : "bg-transparent border-[#E2E2DF] text-[#A8A29E] hover:text-[#78716C]"
              }`}
              title="点击切换互动达成率折线显隐"
            >
              <span
                className="size-1.5 rounded-full"
                style={{
                  backgroundColor: visibleMetrics.interaction ? "#43718E" : "#A8A29E",
                }}
              />
              <span>互动达成率</span>
            </button>
            <button
              type="button"
              onClick={() => toggleMetric("core")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] transition-colors cursor-pointer border ${
                visibleMetrics.core
                  ? "bg-[#6FAA7D]/10 border-[#6FAA7D]/30 text-[#6FAA7D]"
                  : "bg-transparent border-[#E2E2DF] text-[#A8A29E] hover:text-[#78716C]"
              }`}
              title="点击切换核心指标达成率折线显隐"
            >
              <span
                className="size-1.5 rounded-full"
                style={{
                  backgroundColor: visibleMetrics.core ? "#6FAA7D" : "#A8A29E",
                }}
              />
              <span>核心达成率</span>
            </button>
          </div>
        )}
      </div>

      {state === "error" ? (
        <div className="p-6 text-center rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 text-[12px] text-[#C0685C]">
          文案内容质量数据加载异常，请稍后刷新重试
        </div>
      ) : chartData.length === 0 ? (
        <div className="p-6 text-center rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 text-[12px] text-[#78716C]">
          近 30 天暂无该岗位作品记录
        </div>
      ) : (
        <div className="flex flex-col gap-1 mt-0.5" onMouseLeave={() => setHoveredWork(null)}>
          {/* 行情带：32px 死锁单行高度，避免划入划出下方折线图上下颠簸 */}
          <div
            className={`px-0.5 h-8 min-h-[32px] max-h-[32px] flex items-center justify-between gap-3 text-[12px] border-b border-[#E2E2DF]/50 ${
              hoveredWork?.reportId ? "cursor-pointer" : ""
            }`}
            onClick={() => {
              if (hoveredWork?.reportId && diagnosisContext) {
                void diagnosisContext.openDiagnosisByReportId(hoveredWork.reportId);
              }
            }}
            title={hoveredWork?.reportId ? "点击打开作品复盘诊断" : undefined}
          >
            {hoveredWork ? (
              <div className="flex items-center justify-between w-full gap-3 min-w-0">
                {/* 作品信息：日期、账号、标题、话题 */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-normal text-[#78716C] shrink-0 tabular-nums">
                    {hoveredWork.reportDate.slice(5)}
                  </span>
                  <span
                    className="text-[#1F1E1D] font-normal truncate"
                    title={
                      hoveredWork.accountName
                        ? `${hoveredWork.title || "未命名作品"} (@${hoveredWork.accountName})`
                        : hoveredWork.title || "未命名作品"
                    }
                  >
                    {hoveredWork.title || "未命名作品"}
                  </span>
                  <span className="rounded bg-[#F1F1F0] px-1 py-0.2 text-[12px] text-[#78716C] shrink-0">
                    {getTopicLabel(hoveredWork.topicKind, hoveredWork.coreMetric)}
                  </span>
                </div>

                {/* 达成率数据表现与状态 */}
                <div className="flex items-center gap-2.5 shrink-0 tabular-nums whitespace-nowrap">
                  <span className="text-[#78716C]">
                    播 <span className="font-normal text-[#1F1E1D]">{formatBigNumber(hoveredWork.playCount)}</span>
                  </span>
                  {hoveredWork.status === "rated" ? (
                    <>
                      {visibleMetrics.content && (
                        <span className="text-[#78716C]">
                          内容达成{" "}
                          <span className="font-normal text-[#D97757]">
                            {hoveredWork.contentAchievement != null
                              ? `${Math.round(hoveredWork.contentAchievement)}%`
                              : "—"}
                          </span>
                          {hoveredWork.contentGrade && (
                            <span
                              className={`ml-1 font-normal ${
                                BREAKOUT_GRADE_TEXT_CLASS[hoveredWork.contentGrade]
                              }`}
                            >
                              ({hoveredWork.contentGrade})
                            </span>
                          )}
                        </span>
                      )}
                      {visibleMetrics.interaction && (
                        <span className="text-[#78716C]">
                          互动{" "}
                          <span className="font-normal text-[#43718E]">
                            {hoveredWork.interactionAchievement != null
                              ? `${Math.round(hoveredWork.interactionAchievement)}%`
                              : "—"}
                          </span>
                        </span>
                      )}
                      {visibleMetrics.core && (
                        <span className="text-[#78716C]">
                          核心{" "}
                          <span className="font-normal text-[#6FAA7D]">
                            {hoveredWork.coreAchievement != null
                              ? `${Math.round(hoveredWork.coreAchievement)}%`
                              : "—"}
                          </span>
                        </span>
                      )}
                      {hoveredWork.overallGrade ? (
                        <span className="text-[#78716C]">
                          综合{" "}
                          <span
                            className={`font-normal ${
                              BREAKOUT_GRADE_TEXT_CLASS[hoveredWork.overallGrade]
                            }`}
                          >
                            {hoveredWork.overallGrade}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[#A8A29E]">综合未评</span>
                      )}
                    </>
                  ) : (
                    <span className="rounded bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] text-[#A8A29E] border border-[#E2E2DF]">
                      {getContentQualityStatusText(hoveredWork.status)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center w-full min-w-0">
                {/* 默认均值带：单行展示，综合良优率无样本显示「—」非「0%」 */}
                <div className="flex items-center gap-2.5 min-w-0 whitespace-nowrap">
                  <span className="text-[#D97757] font-serif select-none text-[13px]">✦</span>
                  <span
                    className="text-[#78716C] font-normal shrink-0"
                    title="文案内容目标：达成率均值使用两项指标完整样本；综合良优率使用综合已评级样本"
                  >
                    近30天内容目标
                  </span>
                  {summary ? (
                    <>
                      {visibleMetrics.content && summary.avgContentAchievement != null && (
                        <span className="text-[#78716C] tabular-nums">
                          均达成 <span className="font-normal text-[#D97757]">{Math.round(summary.avgContentAchievement)}%</span>
                        </span>
                      )}
                      {visibleMetrics.interaction && summary.avgInteractionAchievement != null && (
                        <span className="text-[#78716C] tabular-nums">
                          均互动 <span className="font-normal text-[#43718E]">{Math.round(summary.avgInteractionAchievement)}%</span>
                        </span>
                      )}
                      {visibleMetrics.core && summary.avgCoreAchievement != null && (
                        <span className="text-[#78716C] tabular-nums">
                          均核心 <span className="font-normal text-[#6FAA7D]">{Math.round(summary.avgCoreAchievement)}%</span>
                        </span>
                      )}
                      <span className="text-[#78716C] tabular-nums" title="两项指标均完整可计算的作品篇数">
                        指标完整 <span className="font-normal text-[#1F1E1D]">{summary.achievementSampleCount}</span> 篇
                      </span>
                      <span className="text-[#78716C] tabular-nums" title="综合已评级篇数 / 署名作品篇数">
                        已评级 <span className="font-normal text-[#1F1E1D]">{summary.ratedCount}</span>/{summary.totalCount}
                      </span>
                      <span className="text-[#78716C] tabular-nums" title="综合评级为良或优的篇数 ÷ 综合已评级篇数">
                        综合良优率{" "}
                        <span className="font-normal text-[#141413]">
                          {summary.ratedCount === 0 || summary.goodExcellentRate === null
                            ? "—"
                            : `${Math.round(summary.goodExcellentRate * 100)}%`}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="text-[#A8A29E] text-[12px]">质量数据尚未接入</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 折线图 */}
          <div className="h-48 w-full mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 16, left: -20, bottom: 4 }}
                onMouseMove={(state) => {
                  const point = resolveWriterChartPoint(state, chartData);
                  if (point) {
                    setHoveredWork(point);
                  }
                }}
                onClick={(state) => {
                  const point = resolveWriterChartPoint(state, chartData);
                  if (point?.reportId && diagnosisContext) {
                    void diagnosisContext.openDiagnosisByReportId(point.reportId);
                  }
                }}
                className="cursor-pointer"
              >
                <CartesianGrid {...CHART_GRID_PROPS} />
                <XAxis
                  dataKey="reportId"
                  tickLine={false}
                  axisLine={{ stroke: "#E2E2DF" }}
                  tick={{ ...CHART_AXIS_TICK, fontSize: 12 }}
                  interval="preserveStartEnd"
                  tickFormatter={(_val, idx) => {
                    const item = chartData[idx];
                    return item ? item.reportDate.slice(5) : "";
                  }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={{ stroke: "#E2E2DF" }}
                  tick={{ ...CHART_AXIS_TICK, fontSize: 12 }}
                  domain={[
                    0,
                    (dataMax: number) => {
                      // 动态自适应上限，依据后端 rules 下发的标准线，不硬编码数字
                      const maxThreshold = rules?.gradeThresholds?.excellent ?? 100;
                      return Math.max(Math.ceil(maxThreshold * 1.2), Math.ceil((dataMax ?? 0) * 1.1), 100);
                    },
                  ]}
                  tickFormatter={(val: number) => `${val}%`}
                />

                {/* 动态参考线：完全由后端 rules.gradeThresholds 驱动，零硬编码数字 */}
                {rules?.gradeThresholds && (
                  <>
                    <ReferenceLine
                      y={rules.gradeThresholds.excellent}
                      stroke="#5E3A8C"
                      strokeDasharray="3 3"
                      strokeOpacity={0.45}
                      label={{
                        value: "优",
                        position: "right",
                        fill: "#5E3A8C",
                        fontSize: 12,
                        offset: 4,
                      }}
                    />
                    <ReferenceLine
                      y={rules.gradeThresholds.good}
                      stroke="#9E2A2B"
                      strokeDasharray="3 3"
                      strokeOpacity={0.45}
                      label={{
                        value: "良",
                        position: "right",
                        fill: "#9E2A2B",
                        fontSize: 12,
                        offset: 4,
                      }}
                    />
                    <ReferenceLine
                      y={rules.gradeThresholds.fair}
                      stroke="#875317"
                      strokeDasharray="3 3"
                      strokeOpacity={0.45}
                      label={{
                        value: "普",
                        position: "right",
                        fill: "#875317",
                        fontSize: 12,
                        offset: 4,
                      }}
                    />
                  </>
                )}

                <RechartsTooltip
                  content={<WriterGrowthTooltipBridge onHover={setHoveredWork} />}
                  cursor={{ stroke: "#D97757", strokeWidth: 1, strokeDasharray: "2 2" }}
                  isAnimationActive={false}
                />

                {visibleMetrics.content && (
                  <Line
                    type="monotone"
                    dataKey="contentAchievement"
                    name="内容达成率"
                    stroke="#D97757"
                    strokeWidth={2}
                    connectNulls={false}
                    isAnimationActive={false}
                    dot={(props) => renderCustomDot(props, "#D97757", false)}
                    activeDot={(props) => renderCustomDot(props, "#D97757", true)}
                  />
                )}

                {visibleMetrics.interaction && (
                  <Line
                    type="monotone"
                    dataKey="interactionAchievement"
                    name="互动达成率"
                    stroke="#43718E"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                    connectNulls={false}
                    isAnimationActive={false}
                    dot={(props) => renderCustomDot(props, "#43718E", false)}
                    activeDot={(props) => renderCustomDot(props, "#43718E", true)}
                  />
                )}

                {visibleMetrics.core && (
                  <Line
                    type="monotone"
                    dataKey="coreAchievement"
                    name="核心达成率"
                    stroke="#6FAA7D"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    connectNulls={false}
                    isAnimationActive={false}
                    dot={(props) => renderCustomDot(props, "#6FAA7D", false)}
                    activeDot={(props) => renderCustomDot(props, "#6FAA7D", true)}
                  />
                )}

                {/* 待采集点（无快照中性虚点，不连入折线） */}
                <Line
                  type="monotone"
                  dataKey="pendingPoint"
                  name="待采集"
                  stroke="none"
                  connectNulls={false}
                  isAnimationActive={false}
                  legendType="none"
                  dot={(props) => renderPendingDot(props, false)}
                  activeDot={(props) => renderPendingDot(props, true)}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}
