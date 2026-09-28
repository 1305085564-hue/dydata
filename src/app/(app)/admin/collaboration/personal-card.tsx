"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { SectionHeading } from "@/components/ui/section-heading";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import { formatBigNumber, formatMomChange, type PersonDetailData } from "./types";
import {
  loadPersonData,
  readPersonDataCache,
  writePersonDataCache,
} from "./person-data";
import { formatAnomalyStatusText } from "@/lib/video-anomaly";
import {
  CATEGORICAL_COLORS,
  CHART_AXIS_TICK,
  CHART_GRID_PROPS,
} from "@/lib/chart-palette";
import {
  CollaborationDiagnosisContext,
  CollaborationWorkReviewLink,
} from "@/components/admin/collaboration-work-review-link";

interface PersonalCardProps {
  userId: string | null;
  year: number;
  month: number;
  onClose: () => void;
  isDiagnosisOpen?: boolean;
}

export function PersonalCard({
  userId,
  year,
  month,
  onClose,
  isDiagnosisOpen = false,
}: PersonalCardProps) {
  const diagnosisContext = useContext(CollaborationDiagnosisContext);
  const cacheKey = userId ? `${userId}-${year}-${month}` : "";
  const cachedData = userId ? readPersonDataCache(cacheKey) : null;

  const [data, setData] = useState<PersonDetailData | null>(cachedData);
  const [loading, setLoading] = useState(Boolean(userId && !cachedData));
  const [error, setError] = useState<string | null>(null);

  // Render-time state derivation & sync when userId/year/month changes
  const [prevKey, setPrevKey] = useState(cacheKey);
  if (cacheKey !== prevKey) {
    setPrevKey(cacheKey);
    setData(cachedData);
    setLoading(Boolean(userId && !cachedData));
    setError(null);
  }

  useEffect(() => {
    if (!userId) return;

    const key = `${userId}-${year}-${month}`;
    const hit = readPersonDataCache(key);
    if (hit) {
      return;
    }

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换人员且无缓存时，发起异步请求前重置加载态与错误
    setLoading(true);
    setError(null);

    loadPersonData(userId, year, month)
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
  }, [userId, year, month]);

  const isOpen = Boolean(userId);

  const chartData = (data?.trend ?? []).map((item) => ({
    monthLabel: `${item.month}月`,
    writer: item.writerCount,
    editor: item.editorCount,
    operator: item.operatorCount,
  }));

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
        className="w-full max-w-2xl sm:max-w-2xl p-0 flex flex-col bg-white border-l border-[#E2E2DF] shadow-claude-dialog"
      >
        {/* Header */}
        <SheetHeader className="flex flex-row items-center justify-between shrink-0">
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
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
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
              {/* 1. 运营数据 KPI 指标群 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[13px]">
                  <SectionHeading as="h3">本月运营概览</SectionHeading>
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

              {/* 2. 近 6 个月产量趋势堆叠柱状图 */}
              <Card className="p-4 gap-2">
                <SectionHeading as="h3">近 6 个月协同产量趋势</SectionHeading>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                    >
                      <CartesianGrid {...CHART_GRID_PROPS} />
                      <XAxis
                        dataKey="monthLabel"
                        tick={CHART_AXIS_TICK}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={CHART_AXIS_TICK}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "#FFFFFF",
                          borderColor: "#E2E2DF",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          color: "#141413",
                          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                          fontSize: "12px",
                        }}
                        itemStyle={{ color: "#1F1E1D" }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
                      />
                      <Bar
                        dataKey="writer"
                        name="文案"
                        stackId="a"
                        fill={CATEGORICAL_COLORS[0]}
                        barSize={16}
                      />
                      <Bar
                        dataKey="editor"
                        name="剪辑"
                        stackId="a"
                        fill={CATEGORICAL_COLORS[1]}
                        barSize={16}
                      />
                      <Bar
                        dataKey="operator"
                        name="运营"
                        stackId="a"
                        fill="#D97757"
                        radius={[3, 3, 0, 0]}
                        barSize={16}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* 3. 本月经手作品明细 */}
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
