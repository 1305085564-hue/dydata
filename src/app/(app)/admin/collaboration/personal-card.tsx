"use client";

import { useEffect, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, X } from "lucide-react";
import { formatBigNumber, type PersonDetailData } from "./types";

interface PersonalCardProps {
  userId: string | null;
  year: number;
  month: number;
  onClose: () => void;
}

// Memory cache to enable instant opening on second click or preloaded hover
const personDataCache = new Map<string, PersonDetailData>();

export function prefetchPersonData(userId: string, year: number, month: number) {
  const cacheKey = `${userId}-${year}-${month}`;
  if (personDataCache.has(cacheKey)) return;

  fetch(`/api/admin/collaboration/person?userId=${userId}&year=${year}&month=${month}`)
    .then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as PersonDetailData;
      personDataCache.set(cacheKey, data);
    })
    .catch(() => {
      // Ignore background prefetch errors
    });
}

export function PersonalCard({ userId, year, month, onClose }: PersonalCardProps) {
  const cacheKey = userId ? `${userId}-${year}-${month}` : "";
  const cachedData = userId ? personDataCache.get(cacheKey) ?? null : null;

  const [data, setData] = useState<PersonDetailData | null>(cachedData);
  const [loading, setLoading] = useState(Boolean(userId && !cachedData));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setData(null);
      return;
    }

    const key = `${userId}-${year}-${month}`;
    const hit = personDataCache.get(key);
    if (hit) {
      setData(hit);
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/admin/collaboration/person?userId=${userId}&year=${year}&month=${month}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "加载个人协作数据失败");
        }
        return json as PersonDetailData;
      })
      .then((resData) => {
        if (isMounted) {
          personDataCache.set(key, resData);
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[800px] sm:max-w-none max-w-[94vw] h-[640px] aspect-[5/4] p-0 rounded-2xl border border-zinc-200/90 bg-white/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col focus:outline-none"
      >
        {/* Header */}
        <DialogHeader className="p-5 pb-3.5 border-b border-zinc-100 flex flex-row items-center justify-between shrink-0 bg-zinc-50/40">
          {loading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-6 w-32 rounded-md" />
              <Skeleton className="h-4 w-48 rounded-md" />
            </div>
          ) : error ? (
            <div>
              <DialogTitle className="text-[16px] font-semibold text-red-600">加载失败</DialogTitle>
              <div className="text-[12px] text-red-500">{error}</div>
            </div>
          ) : data ? (
            <div className="flex items-center justify-between w-full pr-8">
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-[18px] font-semibold text-zinc-900">{data.name}</DialogTitle>
                  <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-normal text-zinc-500 border border-zinc-200/60">
                    个人协作档案
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-zinc-500">
                  <span>本月分工：</span>
                  <span className="rounded bg-sky-50/80 px-1.5 py-0.5 text-[#4A7FB5] border border-sky-200/50 font-medium">
                    文案 <strong className="font-semibold">{data.currentMonth.writerCount}</strong> 篇
                  </span>
                  <span className="rounded bg-purple-50/80 px-1.5 py-0.5 text-[#7B6BA5] border border-purple-200/50 font-medium">
                    剪辑 <strong className="font-semibold">{data.currentMonth.editorCount}</strong> 条
                  </span>
                  <span className="rounded bg-orange-50/80 px-1.5 py-0.5 text-[#D97757] border border-orange-200/50 font-medium">
                    运营 <strong className="font-semibold">{data.currentMonth.operatorCount}</strong> 条
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X className="size-4" />
          </button>
        </DialogHeader>

        {/* Content Body：取消主容器大滚动，采用 flex-1 弹性垂直布局 */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-5 gap-3.5">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
              </div>
              <Skeleton className="h-36 w-full rounded-xl" />
            </div>
          ) : data ? (
            <>
              {/* 中部：KPI 汇总 + 产量趋势 (固定自然高度 shrink-0) */}
              <div className="shrink-0 grid grid-cols-1 md:grid-cols-5 gap-3.5">
                {/* 4 个 KPI 小卡片 (占 2 列) */}
                <div className="md:col-span-2 space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-zinc-800">运营核心表现</span>
                    {data.operatorSummary?.momChange != null && (
                      <span className="font-medium">
                        {data.operatorSummary.momChange > 0 ? (
                          <span className="text-[#DC2626] inline-flex items-center gap-0.5 font-semibold">
                            <TrendingUp className="size-3" />
                            +{(data.operatorSummary.momChange * 100).toFixed(1)}%
                          </span>
                        ) : data.operatorSummary.momChange < 0 ? (
                          <span className="text-[#16A34A] inline-flex items-center gap-0.5 font-semibold">
                            <TrendingDown className="size-3" />
                            {(data.operatorSummary.momChange * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-zinc-500">→ 0%</span>
                        )}
                      </span>
                    )}
                  </div>

                  {data.operatorSummary ? (
                    <div className="grid grid-cols-2 gap-2 text-center pt-1">
                      <div className="rounded-lg border border-zinc-200/70 bg-white p-2">
                        <div className="text-[10px] text-zinc-500">总播放</div>
                        <div className="text-[13px] font-semibold text-zinc-900 tabular-nums mt-0.5">
                          {formatBigNumber(data.operatorSummary.totalPlay)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-zinc-200/70 bg-white p-2">
                        <div className="text-[10px] text-zinc-500">人均播放</div>
                        <div className="text-[13px] font-semibold text-zinc-900 tabular-nums mt-0.5">
                          {formatBigNumber(data.operatorSummary.avgPlay)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-zinc-200/70 bg-white p-2">
                        <div className="text-[10px] text-zinc-500">导粉</div>
                        <div className="text-[13px] font-semibold text-zinc-900 tabular-nums mt-0.5">
                          {data.operatorSummary.totalFollowerConvert.toLocaleString("zh-CN")}
                        </div>
                      </div>
                      <div className="rounded-lg border border-zinc-200/70 bg-white p-2">
                        <div className="text-[10px] text-zinc-500">爆款数</div>
                        <div className="text-[13px] font-semibold text-amber-700 tabular-nums mt-0.5">
                          {data.operatorSummary.hitCount}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-[12px] text-zinc-400">
                      本月暂无带人运营记录
                    </div>
                  )}
                </div>

                {/* 近 6 个月产量堆叠柱状图 (占 3 列) */}
                <div className="md:col-span-3 rounded-xl border border-zinc-200 bg-white p-3 space-y-1">
                  <div className="text-[12px] font-medium text-zinc-700">近 6 个月产量趋势</div>
                  <div className="h-38">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F4F4F5" />
                        <XAxis dataKey="monthLabel" tick={{ fontSize: 10, fill: "#71717A" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#71717A" }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "rgba(24, 24, 27, 0.95)",
                            borderColor: "rgba(39, 39, 42, 0.9)",
                            borderRadius: "8px",
                            padding: "6px 10px",
                            color: "#FFFFFF",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
                            fontSize: "11px",
                          }}
                          itemStyle={{ color: "#F4F4F5" }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 2 }} />
                        <Bar dataKey="writer" name="文案" stackId="a" fill="#3B82F6" barSize={14} />
                        <Bar dataKey="editor" name="剪辑" stackId="a" fill="#8B5CF6" barSize={14} />
                        <Bar dataKey="operator" name="运营" stackId="a" fill="#D97757" radius={[3, 3, 0, 0]} barSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* 底部：经手作品明细 (flex-1 弹性延伸分配剩余高度) */}
              <div className="flex-1 flex flex-col min-h-0 space-y-2">
                <div className="flex items-center justify-between shrink-0">
                  <h4 className="text-[12px] font-semibold text-zinc-900">本月经手作品明细</h4>
                  <span className="text-[11px] text-zinc-400">共 {data.records.length} 条</span>
                </div>

                {data.records.length === 0 ? (
                  <div className="flex-1 rounded-xl border border-zinc-200 p-4 text-center text-[12px] text-zinc-400 flex items-center justify-center">
                    本月暂无明细记录
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white">
                    <table className="w-full text-[12px]">
                      <thead className="sticky top-0 bg-zinc-50/95 backdrop-blur-xs border-b border-zinc-100 text-zinc-500 text-left z-10">
                        <tr>
                          <th className="py-2 px-3 font-medium">日期</th>
                          <th className="py-2 px-3 font-medium">账号 / 标题</th>
                          <th className="py-2 px-3 font-medium text-right">播放</th>
                          <th className="py-2 px-3 font-medium text-center">岗位</th>
                          <th className="py-2 px-3 font-medium text-right pr-3">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {data.records.map((rec) => (
                          <tr key={rec.reportId} className="hover:bg-zinc-50/60 transition-colors h-9">
                            <td className="py-1.5 px-3 text-zinc-500 tabular-nums whitespace-nowrap">{rec.reportDate}</td>
                            <td className="py-1.5 px-3">
                              <div className="font-medium text-zinc-800 leading-tight">{rec.accountName}</div>
                              <div className="text-[11px] text-zinc-400 max-w-[340px] truncate" title={rec.title}>
                                {rec.title}
                              </div>
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-zinc-700 font-medium">
                              {formatBigNumber(rec.playCount)}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {rec.roles.map((r) => {
                                  if (r === "writer") {
                                    return (
                                      <span key={r} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 border border-zinc-200/60">
                                        文案
                                      </span>
                                    );
                                  }
                                  if (r === "editor") {
                                    return (
                                      <span key={r} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 border border-zinc-200/60">
                                        剪辑
                                      </span>
                                    );
                                  }
                                  return (
                                    <span key={r} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 border border-zinc-200/60">
                                      运营
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="py-1.5 px-3 text-right pr-3">
                              {rec.anomaly == null || rec.anomaly === "正常" ? (
                                <span className="text-zinc-400">—</span>
                              ) : (
                                <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-800">
                                  {rec.anomaly}
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
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
