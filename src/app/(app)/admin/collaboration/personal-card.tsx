"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import type { DotItemDotProps, ActiveDotProps, MouseHandlerDataParam } from "recharts";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { ItemHeading } from "@/components/ui/item-heading";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBigNumber, formatMomChange, type CollaborationRoleTab, type PersonDetailData } from "./types";
import {
  clearPersonDataCache,
  loadPersonData,
  readPersonDataCache,
  writePersonDataCache,
} from "./person-data";
import { formatAnomalyStatusText } from "@/lib/video-anomaly";
import {
  CHART_AXIS_TICK,
  CHART_COLORS,
  CHART_GRID_PROPS,
} from "@/lib/chart-palette";
import {
  CollaborationDiagnosisContext,
  CollaborationWorkReviewLink,
} from "@/components/admin/collaboration-work-review-link";
import { WriterQualityChart } from "./writer-quality-chart";
import { BREAKOUT_GRADE_TEXT_CLASS } from "@/lib/breakout-rating";
import { getContentQualityStatusText } from "@/lib/collaboration/content-quality-contract";

interface ChartWorkPoint {
  index: number;
  reportId: string;
  videoId: string | null;
  title: string;
  accountName: string;
  reportDate: string;
  playCount: number;
  hasSnapshot: boolean;
  interactionRate: number | null;
  likeRate: number | null;
  favoriteRate: number | null;
  pendingPoint: number | null;
}

interface GrowthTooltipBridgeProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartWorkPoint }>;
  onHover?: (point: ChartWorkPoint) => void;
}

function GrowthTooltipBridge({ active, payload, onHover }: GrowthTooltipBridgeProps) {
  useEffect(() => {
    if (active && payload && payload.length > 0 && payload[0]?.payload) {
      onHover?.(payload[0].payload);
    }
  }, [active, payload, onHover]);

  return null;
}

/**
 * Recharts 3.x 的图表级鼠标回调只给状态（activeTooltipIndex / activeLabel），
 * 不带数据行；这里按索引→标签两级解析回作品对象，解析不出就返回 null（不猜）。
 */
function resolveChartPoint(
  state: MouseHandlerDataParam | null | undefined,
  data: ChartWorkPoint[],
): ChartWorkPoint | null {
  if (!state || data.length === 0) return null;

  // 1. Numerical index (Recharts passes number or its string form)
  const rawIdx = state.activeTooltipIndex ?? state.activeIndex;
  if (rawIdx != null) {
    const num = typeof rawIdx === "number" ? rawIdx : Number(rawIdx);
    if (!isNaN(num) && num >= 0 && num < data.length) {
      return data[num];
    }
  }

  // 2. activeLabel (corresponds to reportId because XAxis dataKey="reportId")
  if (state.activeLabel != null) {
    const found = data.find((w) => w.reportId === state.activeLabel);
    if (found) return found;
  }

  return null;
}

interface PersonalCardProps {
  userId: string | null;
  year: number;
  month: number;
  activeTab?: CollaborationRoleTab;
  onClose: () => void;
  isDiagnosisOpen?: boolean;
  refreshTrigger?: number;
  onPersonNameLoaded?: (name: string) => void;
}

export function PersonalCard({
  userId,
  year,
  month,
  activeTab,
  onClose,
  isDiagnosisOpen = false,
  refreshTrigger = 0,
  onPersonNameLoaded,
}: PersonalCardProps) {
  const diagnosisContext = useContext(CollaborationDiagnosisContext);
  const cacheKey = userId ? `${userId}-${year}-${month}-${activeTab ?? "legacy"}` : "";
  const cachedData = userId ? readPersonDataCache(cacheKey) : null;

  const [data, setData] = useState<PersonDetailData | null>(cachedData);
  const [loading, setLoading] = useState(Boolean(userId && !cachedData));
  const [error, setError] = useState<string | null>(null);
  const [hoveredWork, setHoveredWork] = useState<ChartWorkPoint | null>(null);

  const [visibleMetrics, setVisibleMetrics] = useState({
    interaction: true,
    like: true,
    favorite: true,
  });

  const toggleMetric = (key: "interaction" | "like" | "favorite") => {
    setVisibleMetrics((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const roleLabel =
    activeTab === "writers"
      ? "文案"
      : activeTab === "editors"
        ? "剪辑"
        : activeTab === "operators"
          ? "运营"
          : activeTab === "talents"
            ? "达人"
            : "经手";

  // Render-time state derivation & sync when userId/year/month changes
  const [prevKey, setPrevKey] = useState(cacheKey);
  if (cacheKey !== prevKey) {
    setPrevKey(cacheKey);
    setData(cachedData);
    setLoading(Boolean(userId && !cachedData));
    setError(null);
    setHoveredWork(null);
  }

  useEffect(() => {
    if (!userId) return;

    const key = `${userId}-${year}-${month}-${activeTab ?? "legacy"}`;
    const hit = readPersonDataCache(key);
    if (hit) {
      return;
    }

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换人员且无缓存时，发起异步请求前重置加载态与错误
    setLoading(true);
    setError(null);

    loadPersonData(userId, year, month, activeTab)
      .then((resData) => {
        if (isMounted) {
          writePersonDataCache(key, resData);
          setData(resData);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId, year, month, activeTab]);

  // 向外部总控报告当前人员姓名（用于诊断抽屉返回面包屑），避免子组件错传账号名
  useEffect(() => {
    if (data?.name && onPersonNameLoaded) {
      onPersonNameLoaded(data.name);
    }
  }, [data?.name, onPersonNameLoaded]);

  // 诊断抽屉内发生生命周期变动（删稿/恢复）时触发刷新，防脏数据
  useEffect(() => {
    if (!userId || !refreshTrigger) return;
    const key = `${userId}-${year}-${month}-${activeTab ?? "legacy"}`;
    clearPersonDataCache(userId);
    let isMounted = true;
    loadPersonData(userId, year, month, activeTab)
      .then((resData) => {
        if (isMounted) {
          writePersonDataCache(key, resData);
          setData(resData);
        }
      })
      .catch((err: Error) => {
        if (isMounted) {
          setError(err.message);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [refreshTrigger, userId, year, month, activeTab]);

  const isOpen = Boolean(userId);

  /**
   * 未采 24h 快照的作品：只在图表底线挂一颗中性虚环灰点，不并入任何折线（避免被读成 0% 暴跌）。
   * 悬停与点击仍然可用，走的是同一条诊断链路。
   */
  const renderPendingDot = (props: DotItemDotProps | ActiveDotProps, active: boolean) => {
    const point = props.payload as ChartWorkPoint | undefined;
    if (!point || point.hasSnapshot) return null;
    const { cx, cy } = props;
    const ink = active ? CHART_COLORS.muted : CHART_COLORS.pending;
    return (
      <g
        key={`pending-${active ? "act" : "dot"}-${point.reportId}`}
        className="cursor-pointer"
        onMouseEnter={() => setHoveredWork(point)}
        onClick={() => {
          if (diagnosisContext) {
            void diagnosisContext.openDiagnosisByReportId(point.reportId);
          }
        }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={active ? 6 : 4}
          fill={CHART_COLORS.surface}
          stroke={ink}
          strokeWidth={active ? 2 : 1.5}
          strokeDasharray={active ? undefined : "2 2"}
        />
        <circle cx={cx} cy={cy} r={active ? 2 : 1.5} fill={ink} />
      </g>
    );
  };

  const growthChartData = useMemo<ChartWorkPoint[]>(() => {
    return (data?.growthWorks ?? []).map((work, idx) => ({
      index: idx,
      reportId: work.reportId,
      videoId: work.videoId,
      title: work.title,
      accountName: work.accountName,
      reportDate: work.reportDate,
      playCount: work.playCount,
      hasSnapshot: work.hasSnapshot,
      interactionRate:
        work.hasSnapshot && work.interactionRate != null
          ? Number((work.interactionRate * 100).toFixed(2))
          : null,
      likeRate:
        work.hasSnapshot && work.likeRate != null
          ? Number((work.likeRate * 100).toFixed(2))
          : null,
      favoriteRate:
        work.hasSnapshot && work.favoriteRate != null
          ? Number((work.favoriteRate * 100).toFixed(2))
          : null,
      pendingPoint: !work.hasSnapshot ? 0 : null,
    }));
  }, [data?.growthWorks]);

  // 行情带默认态：均值口径直接取服务端加权合计（与岗位榜单、小队详情同一个数），
  // 前端只做百分比换算——不在这里把每条作品的比率再平均一次。
  const growthAverages = useMemo(() => {
    const summary = data?.growthSummary;
    if (!summary) return null;
    const toPercent = (value: number | null) =>
      value == null ? null : Number((value * 100).toFixed(2));
    return {
      snapshotCount: summary.snapshotCount,
      avgPlay: summary.snapshotCount > 0 ? summary.avgPlay : null,
      avgInteraction: toPercent(summary.interactionRate),
      avgLike: toPercent(summary.likeRate),
      avgFavorite: toPercent(summary.favoriteRate),
    };
  }, [data?.growthSummary]);

  // 协同生态边注派生（Editorial #4）
  const symbiosisInsight = useMemo(() => {
    if (!data || data.records.length === 0) return null;
    const accountCounts = new Map<string, number>();
    for (const r of data.records) {
      if (r.accountName) {
        accountCounts.set(r.accountName, (accountCounts.get(r.accountName) ?? 0) + 1);
      }
    }
    const topAccounts = Array.from(accountCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    return {
      topAccounts,
      totalWorks: data.records.length,
    };
  }, [data]);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          if (isDiagnosisOpen) return;
          onClose();
        }
      }}
    >
      <SheetContent
        showCloseButton={false}
        overlayClassName={isDiagnosisOpen ? "hidden" : undefined}
        className={cn(
          "w-full max-w-2xl sm:max-w-2xl p-0 flex flex-col bg-white border-l border-[#E2E2DF] shadow-claude-dialog",
          isDiagnosisOpen && "invisible pointer-events-none",
        )}
      >
        {/* Header */}
        <SheetHeader className="flex flex-row items-center justify-between shrink-0 py-3.5">
          {loading ? (
            <div className="space-y-1">
              <Skeleton className="h-6 w-32 rounded-md" />
              <Skeleton className="h-4 w-48 rounded-md" />
            </div>
          ) : error ? (
            <div>
              <SheetTitle className="text-status-danger">
                加载失败
              </SheetTitle>
              <SheetDescription className="text-[12px] text-status-danger">{error}</SheetDescription>
            </div>
          ) : data ? (
            <div className="flex items-center justify-between w-full pr-4">
              <div>
                <div className="flex items-center gap-2">
                  <SheetTitle>
                    {data.name}
                  </SheetTitle>
                  <span className="rounded-md bg-[#F1F1F0] px-2 py-0.5 text-[12px] font-normal text-[#78716C]">
                    个人岗位档案
                  </span>
                </div>
                {/* 头部单行内联信息流 */}
                <div className="mt-1 text-[12px] text-[#78716C] tabular-nums">
                  <span>{year} 年 {month} 月 · 文案 {data.currentMonth.writerCount} · 剪辑 {data.currentMonth.editorCount} · 运营 {data.currentMonth.operatorCount}</span>
                </div>
                {symbiosisInsight && symbiosisInsight.topAccounts.length > 0 && (
                  <div className="mt-1 text-[12px] text-[#78716C] flex items-center gap-1">
                    <span className="text-[#D97757] font-serif select-none">✦</span>
                    <span>
                      协同常配账号：
                      {symbiosisInsight.topAccounts.map(([accName, count]: [string, number], idx: number) => (
                        <span key={accName} className="text-[#1F1E1D] font-normal">
                          {idx > 0 ? "、" : ""}
                          {accName} ({count}篇)
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-md flex items-center justify-center text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors shrink-0 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </SheetHeader>

        {/* Content Body：单层自然阅读延伸 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-3 pb-6 space-y-4">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-60 w-full rounded-xl" />
            </div>
          ) : data ? (
            <>
              {/* 1. 运营数据 KPI 指标群（仅在有独立运营数据或处于运营 Tab 时展示，避免给非运营人员挂空盒子） */}
              {(data.operatorSummary || activeTab === "operators") && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-[14px] font-normal text-[#1F1E1D]">本月运营概览</span>
                    {data.operatorSummary?.momChange != null && (
                      <span className="font-normal text-[12px]">
                        {data.operatorSummary.momChange > 0 ? (
                          <span className="text-status-success inline-flex items-center gap-0.5">
                            <TrendingUp className="size-3" />+
                            {formatMomChange(data.operatorSummary.momChange)} 环比
                          </span>
                        ) : data.operatorSummary.momChange < 0 ? (
                          <span className="text-status-danger inline-flex items-center gap-0.5">
                            <TrendingDown className="size-3" />
                            {formatMomChange(data.operatorSummary.momChange)} 环比
                          </span>
                        ) : (
                          <span className="text-[#78716C]">0.0% 环比</span>
                        )}
                      </span>
                    )}
                  </div>

                  {data.operatorSummary ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Card size="sm" className="p-3 gap-0.5">
                        <div className="text-[12px] text-[#78716C]">总播放</div>
                        <Metric
                          value={formatBigNumber(data.operatorSummary.totalPlay)}
                          className="mt-0.5"
                        />
                      </Card>
                      <Card size="sm" className="p-3 gap-0.5">
                        <div className="text-[12px] text-[#78716C]">条均播放</div>
                        <Metric
                          value={formatBigNumber(data.operatorSummary.avgPlay)}
                          className="mt-0.5"
                        />
                      </Card>
                      <Card size="sm" className="p-3 gap-0.5">
                        <div className="text-[12px] text-[#78716C]">导粉量</div>
                        <Metric
                          value={data.operatorSummary.totalFollowerConvert.toLocaleString("zh-CN")}
                          className="mt-0.5"
                        />
                      </Card>
                      <Card size="sm" className="p-3 gap-0.5">
                        <div className="text-[12px] text-[#78716C]">爆款作品</div>
                        <Metric
                          value={data.operatorSummary.hitCount}
                          className="mt-0.5"
                        />
                      </Card>
                    </div>
                  ) : (
                    <div className="p-3 text-center rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 text-[12px] text-[#78716C]">
                      本月暂无作为独立运营负责的协同作品记录
                    </div>
                  )}
                </div>
              )}

              {/* 2. 近 30 天作品质量增长曲线 */}
              {activeTab === "writers" ? (
                <WriterQualityChart
                  works={data.growthWorks}
                  summary={data.writerQuality?.growthSummary ?? null}
                  rules={data.writerQuality?.rules}
                  state={data.writerQuality?.state ?? "ready"}
                  isQualityReady={Boolean(data.writerQuality)}
                />
              ) : (
                <Card className="p-4 gap-2">
                  <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px] font-normal text-[#1F1E1D] shrink-0">
                      近 30 天作品质量增长曲线
                    </span>
                    <span className="rounded-md bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] font-normal text-[#78716C] shrink-0">
                      {roleLabel} · {growthChartData.length}篇
                    </span>
                  </div>
                  {growthChartData.length > 0 && (
                    /* 胶囊淡底与描边必须与下方折线同色；Tailwind 的任意值类要留字面量才能被编译，
                       取值与 CHART_COLORS.primary / secondary / success 一一对应，改色板时同步这里。 */
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleMetric("interaction")}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] transition-colors cursor-pointer border ${
                          visibleMetrics.interaction
                            ? "bg-[#D97757]/10 border-[#D97757]/30 text-[#D97757]"
                            : "bg-transparent border-[#E2E2DF] text-[#A8A29E] hover:text-[#78716C]"
                        }`}
                        title="点击切换互动率折线显隐"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor: visibleMetrics.interaction ? CHART_COLORS.primary : "#A8A29E",
                          }}
                        />
                        <span>互动率</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleMetric("like")}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] transition-colors cursor-pointer border ${
                          visibleMetrics.like
                            ? "bg-[#4F5E96]/10 border-[#4F5E96]/30 text-[#4F5E96]"
                            : "bg-transparent border-[#E2E2DF] text-[#A8A29E] hover:text-[#78716C]"
                        }`}
                        title="点击切换点赞率折线显隐"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor: visibleMetrics.like ? CHART_COLORS.secondary : "#A8A29E",
                          }}
                        />
                        <span>点赞率</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleMetric("favorite")}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] transition-colors cursor-pointer border ${
                          visibleMetrics.favorite
                            ? "bg-[#6FAA7D]/10 border-[#6FAA7D]/30 text-[#6FAA7D]"
                            : "bg-transparent border-[#E2E2DF] text-[#A8A29E] hover:text-[#78716C]"
                        }`}
                        title="点击切换收藏率折线显隐"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor: visibleMetrics.favorite ? CHART_COLORS.success : "#A8A29E",
                          }}
                        />
                        <span>收藏率</span>
                      </button>
                    </div>
                  )}
                </div>

                {growthChartData.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 text-[12px] text-[#78716C]">
                    近 30 天暂无该岗位作品记录
                  </div>
                ) : (
                  <div
                    className="flex flex-col gap-1 mt-0.5"
                    onMouseLeave={() => setHoveredWork(null)}
                  >
                    {/* 顶部跟随行情带：无框通透即时字幕流（固定单行高度，杜绝换行跳动） */}
                    <div
                      className={`px-0.5 h-8 flex items-center justify-between gap-3 text-[12px] border-b border-[#E2E2DF]/50 ${
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
                          {/* 作品信息：日期与完整标题 */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-medium text-[#78716C] shrink-0 tabular-nums">
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
                          </div>

                          {/* 数据表现 */}
                          <div className="flex items-center gap-2.5 shrink-0 tabular-nums whitespace-nowrap">
                            <span className="text-[#78716C]">
                              播 <span className="font-medium text-[#1F1E1D]">{formatBigNumber(hoveredWork.playCount)}</span>
                            </span>
                            {hoveredWork.hasSnapshot ? (
                              <>
                                {visibleMetrics.interaction && (
                                  <span className="text-[#78716C]">
                                    互动{" "}
                                    <span className="font-medium text-[#D97757]">
                                      {hoveredWork.interactionRate != null ? `${hoveredWork.interactionRate}%` : "—"}
                                    </span>
                                  </span>
                                )}
                                {visibleMetrics.like && (
                                  <span className="text-[#78716C]">
                                    点赞{" "}
                                    <span className="font-medium text-[#4F5E96]">
                                      {hoveredWork.likeRate != null ? `${hoveredWork.likeRate}%` : "—"}
                                    </span>
                                  </span>
                                )}
                                {visibleMetrics.favorite && (
                                  <span className="text-[#78716C]">
                                    收藏{" "}
                                    <span className="font-medium text-[#6FAA7D]">
                                      {hoveredWork.favoriteRate != null ? `${hoveredWork.favoriteRate}%` : "—"}
                                    </span>
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="rounded bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] text-[#A8A29E] border border-[#E2E2DF]">
                                数据待采集（未满 24 小时）
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center w-full min-w-0">
                          {/* 30天均值基线：单行展示，杜绝换行跳动 */}
                          <div className="flex items-center gap-2.5 min-w-0 whitespace-nowrap">
                            <span className="text-[#D97757] font-serif select-none text-[13px]">✦</span>
                            <span
                              className="text-[#78716C] font-normal shrink-0"
                              title="口径与岗位榜单一致：全部作品分子合计 ÷ 播放合计（仅计已同步 24h 快照的作品）"
                            >
                              近30天均值
                            </span>
                            {growthAverages && (
                              <>
                                {growthAverages.avgPlay != null && (
                                  <span className="text-[#78716C] tabular-nums">
                                    均播 <span className="font-medium text-[#1F1E1D]">{formatBigNumber(growthAverages.avgPlay)}</span>
                                  </span>
                                )}
                                {visibleMetrics.interaction && growthAverages.avgInteraction != null && (
                                  <span className="text-[#78716C] tabular-nums">
                                    均互动 <span className="font-medium text-[#D97757]">{growthAverages.avgInteraction}%</span>
                                  </span>
                                )}
                                {visibleMetrics.like && growthAverages.avgLike != null && (
                                  <span className="text-[#78716C] tabular-nums">
                                    均点赞 <span className="font-medium text-[#4F5E96]">{growthAverages.avgLike}%</span>
                                  </span>
                                )}
                                {visibleMetrics.favorite && growthAverages.avgFavorite != null && (
                                  <span className="text-[#78716C] tabular-nums">
                                    均收藏 <span className="font-medium text-[#6FAA7D]">{growthAverages.avgFavorite}%</span>
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="h-48 w-full mt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={growthChartData}
                          margin={{ top: 12, right: 12, left: -20, bottom: 4 }}
                          onMouseMove={(state) => {
                            const point = resolveChartPoint(state, growthChartData);
                            if (point) {
                              setHoveredWork(point);
                            }
                          }}
                          onClick={(state) => {
                            const point = resolveChartPoint(state, growthChartData);
                            if (point?.reportId && diagnosisContext) {
                              void diagnosisContext.openDiagnosisByReportId(point.reportId);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <CartesianGrid {...CHART_GRID_PROPS} />
                          <XAxis
                            dataKey="reportId"
                            tick={CHART_AXIS_TICK}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(reportId: string) => {
                              const item = growthChartData.find((w) => w.reportId === reportId);
                              return item ? item.reportDate.slice(5) : "";
                            }}
                            interval="preserveStartEnd"
                            minTickGap={20}
                          />
                          <YAxis
                            tick={CHART_AXIS_TICK}
                            axisLine={false}
                            tickLine={false}
                            domain={growthChartData.some((w) => w.hasSnapshot) ? [0, "auto"] : [0, 5]}
                            tickFormatter={(v: number) => `${v}%`}
                            allowDecimals={true}
                          />
                          <RechartsTooltip
                            cursor={{
                              stroke: CHART_COLORS.primary,
                              strokeWidth: 1,
                              strokeDasharray: "2 2",
                              strokeOpacity: 0.6,
                            }}
                            content={<GrowthTooltipBridge onHover={setHoveredWork} />}
                            wrapperStyle={{ display: "none" }}
                          />
                        {visibleMetrics.interaction && (
                          <Line
                            type="monotone"
                            dataKey="interactionRate"
                            name="互动率"
                            stroke={CHART_COLORS.primary}
                            strokeWidth={2}
                            connectNulls={false}
                            isAnimationActive={false}
                            dot={{
                              r: 3,
                              fill: CHART_COLORS.surface,
                              stroke: CHART_COLORS.primary,
                              strokeWidth: 2,
                            }}
                            activeDot={{
                              r: 5,
                              fill: CHART_COLORS.primary,
                              stroke: "#FFFFFF",
                              strokeWidth: 2,
                            }}
                          />
                        )}
                        {visibleMetrics.like && (
                          <Line
                            type="monotone"
                            dataKey="likeRate"
                            name="点赞率"
                            stroke={CHART_COLORS.secondary}
                            strokeWidth={1.5}
                            connectNulls={false}
                            isAnimationActive={false}
                            dot={{
                              r: 3,
                              fill: CHART_COLORS.surface,
                              stroke: CHART_COLORS.secondary,
                              strokeWidth: 1.5,
                            }}
                            activeDot={{
                              r: 5,
                              fill: CHART_COLORS.secondary,
                              stroke: "#FFFFFF",
                              strokeWidth: 2,
                            }}
                          />
                        )}
                        {visibleMetrics.favorite && (
                          <Line
                            type="monotone"
                            dataKey="favoriteRate"
                            name="收藏率"
                            stroke={CHART_COLORS.success}
                            strokeWidth={1.5}
                            connectNulls={false}
                            isAnimationActive={false}
                            dot={{
                              r: 3,
                              fill: CHART_COLORS.surface,
                              stroke: CHART_COLORS.success,
                              strokeWidth: 1.5,
                            }}
                            activeDot={{
                              r: 5,
                              fill: CHART_COLORS.success,
                              stroke: "#FFFFFF",
                              strokeWidth: 2,
                            }}
                          />
                        )}
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
              )}

              {/* 3. 本月文案作品 / 经手作品明细 */}
              {activeTab === "writers" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <ItemHeading as="h4">
                      本月文案作品
                    </ItemHeading>
                    <span className="text-[12px] text-[#78716C] tabular-nums">
                      共 {data.writerQuality?.monthWorks?.length ?? 0} 篇作品
                    </span>
                  </div>

                  {!data.writerQuality ? (
                    <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#78716C]">
                      质量数据尚未接入
                    </div>
                  ) : data.writerQuality.state === "error" ? (
                    <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#C0685C]">
                      文案作品明细加载异常，请稍后重试
                    </div>
                  ) : data.writerQuality.monthWorks.length === 0 ? (
                    <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#78716C]">
                      本月暂无文案作品记录
                    </div>
                  ) : (
                    <Card className="overflow-x-auto p-0 gap-0">
                      <table className="w-full text-[12px] min-w-[560px] table-fixed">
                        <thead className="bg-transparent border-b border-[#E2E2DF]/60 text-[13px] font-normal text-[#78716C] text-left">
                          <tr>
                            <th className="py-2.5 px-3 w-[84px] shrink-0 font-normal">日期</th>
                            <th className="py-2.5 px-3 w-auto min-w-[160px] font-normal">账号 / 作品标题</th>
                            <th className="py-2.5 px-2.5 text-right w-[72px] shrink-0 font-normal">播放量</th>
                            <th className="py-2.5 px-2.5 text-center w-[110px] shrink-0 font-normal">话题 / 核心指标</th>
                            <th className="py-2.5 px-2.5 text-right w-[140px] shrink-0 font-normal">达成率表现</th>
                            <th className="py-2.5 px-3 text-right w-[80px] shrink-0 font-normal">综合评级</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E2DF]/60">
                          {data.writerQuality.monthWorks.map((work) => {
                            const q = work.contentQuality;
                            const topicText =
                              q?.topicKind === "dry_goods"
                                ? "干货 · 收藏"
                                : q?.topicKind === "review"
                                  ? "复盘 · 点赞"
                                  : q?.topicKind === "other"
                                    ? "其他 · 点赞"
                                    : "未识别话题";

                            return (
                              <tr
                                key={work.reportId}
                                onClick={() => {
                                  if (work.reportId && diagnosisContext) {
                                    void diagnosisContext.openDiagnosisByReportId(work.reportId);
                                  }
                                }}
                                className="hover:bg-[#EBEBE9]/80 transition-colors cursor-pointer group"
                              >
                                <td className="py-2 px-3 text-[#78716C] tabular-nums whitespace-nowrap">
                                  {work.reportDate}
                                </td>
                                <td className="py-2 px-3 min-w-0">
                                  <div className="font-normal text-[#1F1E1D] truncate" title={work.accountName}>
                                    {work.accountName}
                                  </div>
                                  <div className="flex min-w-0 items-center gap-1">
                                    <CollaborationWorkReviewLink
                                      reportId={work.reportId}
                                      preview={{
                                        title: work.title,
                                        accountName: work.accountName,
                                        playCount: work.playCount,
                                        reportDate: work.reportDate,
                                        dataSource: work.dataSource,
                                      }}
                                      className="min-w-0 truncate text-left text-[12px] text-[#78716C] group-hover:text-[#141413] group-hover:underline disabled:cursor-wait disabled:opacity-60 block"
                                    >
                                      {work.title || "未命名作品"}
                                    </CollaborationWorkReviewLink>
                                    {work.dataSource === "manual" ? (
                                      <Badge title="该数据由人工填写或修改">手工</Badge>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-right tabular-nums text-[#1F1E1D] font-normal whitespace-nowrap">
                                  {formatBigNumber(work.playCount)}
                                </td>
                                <td className="py-2 px-2.5 text-center whitespace-nowrap">
                                  <span className="inline-block rounded-md bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] font-normal text-[#1F1E1D]">
                                    {topicText}
                                  </span>
                                </td>
                                <td className="py-2 px-2.5 text-right whitespace-nowrap tabular-nums">
                                  {q?.status === "rated" && q.contentAchievement != null ? (
                                    <div>
                                      <span className="font-normal text-[#141413]">
                                        {Math.round(q.contentAchievement)}%
                                      </span>
                                      {q.contentGrade && (
                                        <span className={`ml-1 font-normal ${BREAKOUT_GRADE_TEXT_CLASS[q.contentGrade]}`}>
                                          ({q.contentGrade})
                                        </span>
                                      )}
                                      <div className="text-[12px] text-[#78716C]">
                                        互动 {q.interactionAchievement != null ? `${Math.round(q.interactionAchievement)}%` : "—"} · 核心 {q.coreAchievement != null ? `${Math.round(q.coreAchievement)}%` : "—"}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="rounded bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] text-[#A8A29E] border border-[#E2E2DF]">
                                      {getContentQualityStatusText(q?.status ?? "pending_snapshot")}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  {q?.overallGrade ? (
                                    <span className={`font-normal ${BREAKOUT_GRADE_TEXT_CLASS[q.overallGrade]}`}>
                                      综合{q.overallGrade}
                                    </span>
                                  ) : (
                                    <span className="text-[#A8A29E]">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <ItemHeading as="h4">
                      本月经手作品明细
                    </ItemHeading>
                    <span className="text-[12px] text-[#78716C] tabular-nums">
                      共 {data.records.length} 条作品
                    </span>
                  </div>

                  {data.records.length === 0 ? (
                    <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#78716C]">
                      本月暂无协同作品记录
                    </div>
                  ) : (
                    <Card className="overflow-x-auto p-0 gap-0">
                      <table className="w-full text-[12px] min-w-[520px] table-fixed">
                        <thead className="bg-transparent border-b border-[#E2E2DF]/60 text-[13px] font-normal text-[#78716C] text-left">
                          <tr>
                            <th className="py-2.5 px-3 w-[84px] shrink-0 font-normal">日期</th>
                            <th className="py-2.5 px-3 w-auto min-w-[160px] font-normal">账号 / 作品标题</th>
                            <th className="py-2.5 px-2.5 text-right w-[72px] shrink-0 font-normal">播放量</th>
                            <th className="py-2.5 px-2.5 text-center w-[100px] shrink-0 font-normal">担任岗位</th>
                            <th className="py-2.5 px-3 text-right w-[64px] shrink-0 font-normal">状态</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E2DF]/60">
                          {data.records.map((rec) => (
                            <tr
                              key={rec.reportId}
                              onClick={() => {
                                if (rec.reportId && diagnosisContext) {
                                  void diagnosisContext.openDiagnosisByReportId(rec.reportId);
                                }
                              }}
                              className="hover:bg-[#EBEBE9]/80 transition-colors cursor-pointer group"
                            >
                              <td className="py-2 px-3 text-[#78716C] tabular-nums whitespace-nowrap">
                                {rec.reportDate}
                              </td>
                              <td className="py-2 px-3 min-w-0">
                                <div className="font-normal text-[#1F1E1D] truncate" title={rec.accountName}>
                                  {rec.accountName}
                                </div>
                                <div className="flex min-w-0 items-center gap-1">
                                  <CollaborationWorkReviewLink
                                    reportId={rec.reportId}
                                    preview={{
                                      title: rec.title,
                                      accountName: rec.accountName,
                                      playCount: rec.playCount,
                                      reportDate: rec.reportDate,
                                      dataSource: rec.dataSource,
                                    }}
                                    className="min-w-0 truncate text-left text-[12px] text-[#78716C] group-hover:text-[#141413] group-hover:underline disabled:cursor-wait disabled:opacity-60 block"
                                  >
                                    {rec.title || "未命名作品"}
                                  </CollaborationWorkReviewLink>
                                  {rec.dataSource === "manual" ? (
                                    <Badge title="该数据由人工填写或修改">手工</Badge>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-2 px-2.5 text-right tabular-nums text-[#1F1E1D] font-normal whitespace-nowrap">
                                {formatBigNumber(rec.playCount)}
                              </td>
                              <td className="py-2 px-2.5 text-center whitespace-nowrap">
                                <span className="inline-block rounded-md bg-[#F1F1F0] px-1.5 text-[12px] font-normal text-[#1F1E1D]">
                                  {rec.roles.map((r) => (r === "writer" ? "文案" : r === "editor" ? "剪辑" : "运营")).join(" · ")}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap">
                                {rec.anomaly == null ||
                                rec.anomaly === "正常" ||
                                rec.anomaly === "normal" ? (
                                  <span className="text-[#A8A29E]">—</span>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-[12px] bg-[#F1F1F0] text-[#1F1E1D] px-1.5 py-0"
                                  >
                                    {formatAnomalyStatusText(rec.anomaly)}
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  )}
                </div>
              )}

              {/* 完卷微符 */}
              <div className="flex items-center justify-center gap-3 py-4 text-[#E2E2DF]">
                <span className="h-[1px] w-8 bg-[#E2E2DF]" />
                <span className="text-[12px] text-[#A8A29E]">✦ 档案完卷</span>
                <span className="h-[1px] w-8 bg-[#E2E2DF]" />
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
