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
import {
  readPersonDataCache,
  writePersonDataCache,
} from "./person-data";
import { formatAnomalyStatusText } from "@/lib/video-anomaly";
import {
  CHART_AXIS_TICK,
  CHART_COLORS,
  CHART_GRID_PROPS,
  CATEGORICAL_COLORS,
} from "@/lib/chart-palette";

interface PersonalCardProps {
  userId: string | null;
  year: number;
  month: number;
  onClose: () => void;
}

export function PersonalCard({
  userId,
  year,
  month,
  onClose,
}: PersonalCardProps) {
  const cacheKey = userId ? `${userId}-${year}-${month}` : "";
  const cachedData = userId ? readPersonDataCache(cacheKey) : null;

  const [data, setData] = useState<PersonDetailData | null>(cachedData);
  const [loading, setLoading] = useState(Boolean(userId && !cachedData));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      return;
    }

    const key = `${userId}-${year}-${month}`;
    const hit = readPersonDataCache(key);
    if (hit) {
      setData(hit);
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(
      `/api/admin/collaboration/person?userId=${userId}&year=${year}&month=${month}`,
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "加载个人协作数据失败");
        }
        return json as PersonDetailData;
      })
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[800px] sm:max-w-none max-w-[94vw] max-h-[85vh] h-auto p-0 rounded-2xl border border-[#E5E0D6] bg-white/95 shadow-claude-dialog overflow-hidden flex flex-col focus:outline-none"
      >
        {/* Header */}
        <DialogHeader className="p-5 pb-3.5 border-b border-[#ECE7DE] flex flex-row items-center justify-between shrink-0 bg-[#FBF9F5]/40">
          {loading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-6 w-32 rounded-md" />
              <Skeleton className="h-4 w-48 rounded-md" />
            </div>
          ) : error ? (
            <div>
              <DialogTitle className="font-serif tracking-tight text-base font-semibold text-[#C0685C]">
                加载失败
              </DialogTitle>
              <div className="text-[12px] text-[#C0685C]">{error}</div>
            </div>
          ) : data ? (
            <div className="flex items-center justify-between w-full pr-8">
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="font-serif tracking-tight text-lg font-semibold text-[#1C1917]">
                    {data.name}
                  </DialogTitle>
                  <span className="rounded-md bg-[#F5F3EE] px-2 py-0.5 text-[11px] font-normal text-[#78716C]">
                    个人协作档案
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-[#78716C]">
                  <span>本月分工：</span>
                  <span className="rounded bg-[#F5F3EE]/80 px-1.5 py-0.5 text-[#43718E] font-medium">
                    文案{" "}
                    <strong className="font-semibold">
                      {data.currentMonth.writerCount}
                    </strong>{" "}
                    篇
                  </span>
                  <span className="rounded bg-[#F5F3EE]/80 px-1.5 py-0.5 text-[#7E5C99] font-medium">
                    剪辑{" "}
                    <strong className="font-semibold">
                      {data.currentMonth.editorCount}
                    </strong>{" "}
                    条
                  </span>
                  <span className="rounded bg-[#D97757]/10 px-1.5 py-0.5 text-[#D97757] font-medium">
                    运营{" "}
                    <strong className="font-semibold">
                      {data.currentMonth.operatorCount}
                    </strong>{" "}
                    条
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-lg flex items-center justify-center text-[#78716C] hover:text-[#292524] hover:bg-[#F5F3EE] transition-colors"
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
                <div className="md:col-span-2 space-y-2 rounded-xl border border-[#E5E0D6]/80 bg-[#FBF9F5]/60 p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-[#292524]">
                      运营核心表现
                    </span>
                    {data.operatorSummary?.momChange != null && (
                      <span className="font-medium">
                        {data.operatorSummary.momChange > 0 ? (
                          <span className="text-[#DC2626] inline-flex items-center gap-0.5 font-semibold">
                            <TrendingUp className="size-3" />+
                            {(data.operatorSummary.momChange * 100).toFixed(1)}%
                          </span>
                        ) : data.operatorSummary.momChange < 0 ? (
                          <span className="text-[#6FAA7D] inline-flex items-center gap-0.5 font-semibold">
                            <TrendingDown className="size-3" />
                            {(data.operatorSummary.momChange * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[#78716C]">→ 0%</span>
                        )}
                      </span>
                    )}
                  </div>

                  {data.operatorSummary ? (
                    <div className="grid grid-cols-2 gap-2 text-center pt-1">
                      <div className="rounded-lg border border-[#E5E0D6] bg-white p-2">
                        <div className="text-[10px] text-[#78716C]">总播放</div>
                        <div className="text-[13px] font-semibold text-[#1C1917] tabular-nums mt-0.5">
                          {formatBigNumber(data.operatorSummary.totalPlay)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#E5E0D6] bg-white p-2">
                        <div className="text-[10px] text-[#78716C]">
                          人均播放
                        </div>
                        <div className="text-[13px] font-semibold text-[#1C1917] tabular-nums mt-0.5">
                          {formatBigNumber(data.operatorSummary.avgPlay)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#E5E0D6] bg-white p-2">
                        <div className="text-[10px] text-[#78716C]">导粉</div>
                        <div className="text-[13px] font-semibold text-[#1C1917] tabular-nums mt-0.5">
                          {data.operatorSummary.totalFollowerConvert.toLocaleString(
                            "zh-CN",
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#E5E0D6] bg-white p-2">
                        <div className="text-[10px] text-[#78716C]">爆款数</div>
                        <div className="text-[13px] font-semibold text-[#292524] tabular-nums mt-0.5">
                          {data.operatorSummary.hitCount}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-[12px] text-[#78716C]">
                      本月还没有带人运营记录
                    </div>
                  )}
                </div>

                {/* 近 6 个月产量堆叠柱状图 (占 3 列) */}
                <div className="md:col-span-3 rounded-xl border border-[#E5E0D6] bg-white p-3 space-y-1">
                  <div className="text-[12px] font-medium text-[#292524]">
                    近 6 个月产量趋势
                  </div>
                  <div className="h-38">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                      >
                        <CartesianGrid
                          {...CHART_GRID_PROPS}
                        />
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
                            borderColor: "#E5E0D6",
                            borderRadius: "8px",
                            padding: "6px 10px",
                            color: "#1C1917",
                            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                            fontSize: "11px",
                          }}
                          itemStyle={{ color: "#292524" }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10, paddingTop: 2 }}
                        />
                        <Bar
                          dataKey="writer"
                          name="文案"
                          stackId="a"
                          fill="#43718E"
                          barSize={14}
                        />
                        <Bar
                          dataKey="editor"
                          name="剪辑"
                          stackId="a"
                          fill={CATEGORICAL_COLORS[1]}
                          barSize={14}
                        />
                        <Bar
                          dataKey="operator"
                          name="运营"
                          stackId="a"
                          fill={CHART_COLORS.primary}
                          radius={[3, 3, 0, 0]}
                          barSize={14}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* 底部：经手作品明细 (flex-1 弹性延伸分配剩余高度) */}
              <div className="flex-1 flex flex-col min-h-0 space-y-2">
                <div className="flex items-center justify-between shrink-0">
                  <h4 className="font-serif text-[12px] font-semibold tracking-tight text-[#1C1917]">
                    本月经手作品明细
                  </h4>
                  <span className="text-[11px] text-[#78716C]">
                    共 {data.records.length} 条
                  </span>
                </div>

                {data.records.length === 0 ? (
                  <div className="flex-1 rounded-xl border border-[#E5E0D6] p-4 text-center text-[12px] text-[#78716C] flex items-center justify-center">
                    本月还没有明细记录
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto rounded-xl border border-[#ECE7DE] bg-white">
                    <table className="w-full text-[12px]">
                      <thead className="sticky top-0 bg-[#FBF9F5]/85 backdrop-blur-md border-b border-[#ECE7DE]/60 text-[11px] uppercase tracking-wider font-medium text-[#78716C] text-left z-10">
                        <tr>
                          <th className="py-2 px-3">日期</th>
                          <th className="py-2 px-3">账号 / 标题</th>
                          <th className="py-2 px-3 text-right">
                            播放
                          </th>
                          <th className="py-2 px-3 text-center">
                            岗位
                          </th>
                          <th className="py-2 px-3 text-right pr-3">
                            状态
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ECE7DE]">
                        {data.records.map((rec) => (
                          <tr
                            key={rec.reportId}
                            className="hover:bg-[#FBF9F5]/60 transition-colors h-9"
                          >
                            <td className="py-1.5 px-3 text-[#78716C] tabular-nums whitespace-nowrap">
                              {rec.reportDate}
                            </td>
                            <td className="py-1.5 px-3">
                              <div className="font-medium text-[#292524] leading-tight">
                                {rec.accountName}
                              </div>
                              <div
                                className="text-[11px] text-[#78716C] max-w-[340px] truncate"
                                title={rec.title}
                              >
                                {rec.title}
                              </div>
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-[#292524] font-medium">
                              {formatBigNumber(rec.playCount)}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {rec.roles.map((r) => {
                                  if (r === "writer") {
                                    return (
                                      <span
                                        key={r}
                                        className="rounded bg-[#F5F3EE] px-1.5 py-0.5 text-[10px] font-medium text-[#292524] border border-[#E5E0D6]"
                                      >
                                        文案
                                      </span>
                                    );
                                  }
                                  if (r === "editor") {
                                    return (
                                      <span
                                        key={r}
                                        className="rounded bg-[#F5F3EE] px-1.5 py-0.5 text-[10px] font-medium text-[#292524] border border-[#E5E0D6]"
                                      >
                                        剪辑
                                      </span>
                                    );
                                  }
                                  return (
                                    <span
                                      key={r}
                                      className="rounded bg-[#F5F3EE] px-1.5 py-0.5 text-[10px] font-medium text-[#292524] border border-[#E5E0D6]"
                                    >
                                      运营
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="py-1.5 px-3 text-right pr-3">
                              {rec.anomaly == null ||
                              rec.anomaly === "正常" ||
                              rec.anomaly === "normal" ? (
                                <span className="text-[#78716C]">—</span>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-[#F5F3EE] text-[#292524]"
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
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
