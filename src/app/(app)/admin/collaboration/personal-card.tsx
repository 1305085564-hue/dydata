"use client";

import { useContext, useEffect, useState } from "react";
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
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import { formatBigNumber, type PersonDetailData } from "./types";
import {
  loadPersonData,
  readPersonDataCache,
  writePersonDataCache,
} from "./person-data";
import { formatAnomalyStatusText } from "@/lib/video-anomaly";
import {
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
        <div className="px-6 py-4 border-b border-[#E2E2DF] flex items-center justify-between shrink-0 bg-[#FCFCFB]/40">
          {loading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-6 w-32 rounded-md" />
              <Skeleton className="h-4 w-48 rounded-md" />
            </div>
          ) : error ? (
            <div>
              <SheetTitle className="text-base font-medium text-[#C0685C]">
                加载失败
              </SheetTitle>
              <SheetDescription className="text-[12px] text-[#C0685C]">{error}</SheetDescription>
            </div>
          ) : data ? (
            <div className="flex items-center justify-between w-full pr-4">
              <div>
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-lg font-[580] text-[#1C1917]">
                    {data.name}
                  </SheetTitle>
                  <span className="rounded-md bg-[#F1F1F0] px-2 py-0.5 text-[11px] font-normal text-[#78716C]">
                    个人岗位档案
                  </span>
                </div>
                {/* 头部单行内联信息流（去彩色碎屑药丸） */}
                <div className="mt-1 text-[12px] text-[#78716C] tabular-nums">
                  <span>{year} 年 {month} 月 · 文案 {data.currentMonth.writerCount} · 剪辑 {data.currentMonth.editorCount} · 运营 {data.currentMonth.operatorCount}</span>
                </div>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-lg flex items-center justify-center text-[#78716C] hover:text-[#292524] hover:bg-[#EBEBE9] transition-colors shrink-0 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

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
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-[#1C1917]">本月运营概览</span>
                  {data.operatorSummary?.momChange != null && (
                    <span className="font-medium text-[12px]">
                      {data.operatorSummary.momChange > 0 ? (
                        <span className="text-[#6FAA7D] inline-flex items-center gap-0.5">
                          <TrendingUp className="size-3" />+
                          {(data.operatorSummary.momChange * 100).toFixed(1)}% 环比
                        </span>
                      ) : data.operatorSummary.momChange < 0 ? (
                        <span className="text-[#C0685C] inline-flex items-center gap-0.5">
                          <TrendingDown className="size-3" />
                          {(data.operatorSummary.momChange * 100).toFixed(1)}% 环比
                        </span>
                      ) : (
                        <span className="text-[#78716C]">0.0% 环比</span>
                      )}
                    </span>
                  )}
                </div>

                {data.operatorSummary ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="rounded-xl bg-white p-3 shadow-card-ring">
                      <div className="text-[11px] text-[#78716C]">总播放</div>
                      <div className="text-[15px] font-medium text-[#1C1917] tabular-nums mt-0.5">
                        {formatBigNumber(data.operatorSummary.totalPlay)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-card-ring">
                      <div className="text-[11px] text-[#78716C]">条均播放</div>
                      <div className="text-[15px] font-medium text-[#1C1917] tabular-nums mt-0.5">
                        {formatBigNumber(data.operatorSummary.avgPlay)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-card-ring">
                      <div className="text-[11px] text-[#78716C]">导粉量</div>
                      <div className="text-[15px] font-medium text-[#1C1917] tabular-nums mt-0.5">
                        {data.operatorSummary.totalFollowerConvert.toLocaleString("zh-CN")}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-card-ring">
                      <div className="text-[11px] text-[#78716C]">爆款作品</div>
                      <div className="text-[15px] font-medium text-[#1C1917] tabular-nums mt-0.5">
                        {data.operatorSummary.hitCount}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 text-center rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 text-[12px] text-[#78716C]">
                    本月暂无作为独立运营负责的协同作品记录
                  </div>
                )}
              </div>

              {/* 2. 近 6 个月产量趋势堆叠柱状图 */}
              <div className="rounded-xl bg-white p-4 space-y-2 shadow-card-ring">
                <div className="text-[13px] font-medium text-[#1C1917]">
                  近 6 个月协同产量趋势
                </div>
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
                          color: "#1C1917",
                          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                          fontSize: "11px",
                        }}
                        itemStyle={{ color: "#292524" }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                      />
                      <Bar
                        dataKey="writer"
                        name="文案"
                        stackId="a"
                        fill="#3B82F6"
                        barSize={16}
                      />
                      <Bar
                        dataKey="editor"
                        name="剪辑"
                        stackId="a"
                        fill="#8B5CF6"
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
              </div>

              {/* 3. 本月经手作品明细 */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[13px] font-medium text-[#1C1917]">
                    本月经手作品明细
                  </h4>
                  <span className="text-[12px] text-[#78716C] tabular-nums">
                    共 {data.records.length} 条作品
                  </span>
                </div>

                {data.records.length === 0 ? (
                  <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#78716C]">
                    本月暂无协同作品记录
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#E2E2DF] bg-white overflow-x-auto shadow-2xs">
                    <table className="w-full text-[12px] min-w-[520px] table-fixed">
                      <thead className="bg-transparent border-b border-[#E2E2DF]/60 text-[11px] uppercase tracking-wider font-medium text-[#78716C] text-left">
                        <tr>
                          <th className="py-2.5 px-3 w-[84px] shrink-0">日期</th>
                          <th className="py-2.5 px-3 w-auto min-w-[160px]">账号 / 作品标题</th>
                          <th className="py-2.5 px-2.5 text-right w-[72px] shrink-0">播放量</th>
                          <th className="py-2.5 px-2.5 text-center w-[100px] shrink-0">担任岗位</th>
                          <th className="py-2.5 px-3 text-right w-[64px] shrink-0">状态</th>
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
                              <div className="font-medium text-[#292524] truncate" title={rec.accountName}>
                                {rec.accountName}
                              </div>
                              <div className="flex min-w-0 items-center gap-1.5">
                                <CollaborationWorkReviewLink
                                  reportId={rec.reportId}
                                  className="min-w-0 truncate text-left text-[11.5px] text-[#78716C] group-hover:text-[#292524] group-hover:underline disabled:cursor-wait disabled:opacity-60 block"
                                >
                                  {rec.title || "未命名作品"}
                                </CollaborationWorkReviewLink>
                                {rec.dataSource === "manual" ? (
                                  <span
                                    className="shrink-0 rounded bg-[#E9F0EA] px-1 py-0.5 text-[9.5px] font-medium text-[#4F7A5B]"
                                    title="该数据由人工填写或修改"
                                  >
                                    手工
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="py-2 px-2.5 text-right tabular-nums text-[#292524] font-medium whitespace-nowrap">
                              {formatBigNumber(rec.playCount)}
                            </td>
                            <td className="py-2 px-2.5 text-center whitespace-nowrap">
                              <span className="inline-block rounded bg-[#F1F1F0] px-1.5 py-0.2 text-[10.5px] font-medium text-[#292524]">
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
                                  className="text-[10px] bg-[#F1F1F0] text-[#292524] px-1.5 py-0"
                                >
                                  {formatAnomalyStatusText(rec.anomaly)}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 完卷微符 */}
              <div className="flex items-center justify-center gap-3 py-4 text-[#E2E2DF]">
                <span className="h-[1px] w-8 bg-[#E2E2DF]" />
                <span className="text-[11px] text-[#A8A29E]">✦ 档案完卷</span>
                <span className="h-[1px] w-8 bg-[#E2E2DF]" />
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
