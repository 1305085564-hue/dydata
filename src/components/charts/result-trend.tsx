"use client";

import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedNumber } from "@/components/animated-number";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { 补全连续日期, 平移日期字符串, 日期相差天数, getTrendAxisUpperBound } from "@/lib/趋势图";
import { GROWTH_STALE_DAYS_THRESHOLD } from "@/lib/growth-page";
import { ANIMATION_TIMINGS } from "@/lib/animations";
import {
  CHART_AXIS_TICK,
  CHART_COLORS,
  CHART_GRID_PROPS,
} from "@/lib/chart-palette";
import { cn } from "@/lib/utils";
import { ChartSkeleton } from "./chart-skeleton";
import { ChartActiveDot } from "./chart-active-dot";

export interface ResultTrendDatum {
  date: string;
  playCount: number | null;
  playCountTeamAverage: number | null;
  followerGain: number | null;
  followerGainTeamAverage: number | null;
}

interface ResultTrendProps {
  data: ResultTrendDatum[];
  personalLabel?: string;
  teamAverageLabel?: string;
  emptyText?: string;
  isLoading?: boolean;
  /** 团队 active 人数；传入且小于 5 时不展示团队 P70 对比线（小样本不承诺对比） */
  teamSize?: number;
}

type MetricKey = "playCount" | "followerGain";
type RangeKey = 7 | 30;

/** 缺数区间桥接线的 dataKey（只负责把缺口画成虚线，不进 tooltip） */
const BRIDGE_KEY = "__gapBridge";

const metricMeta: Record<
  MetricKey,
  {
    label: string;
    valueKey: keyof ResultTrendDatum;
    averageKey: keyof ResultTrendDatum;
    formatter: (value: number) => string;
  }
> = {
  playCount: {
    label: "播放量",
    valueKey: "playCount",
    averageKey: "playCountTeamAverage",
    formatter: (value) => value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString(),
  },
  followerGain: {
    label: "涨粉",
    valueKey: "followerGain",
    averageKey: "followerGainTeamAverage",
    formatter: (value) => value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString(),
  },
};

function formatDateLabel(value: string) {
  return value.length >= 10 ? value.slice(5) : value;
}

function 今天日期字符串() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function 趋势方向图标({ positive }: { positive: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={cn("h-3 w-3", positive ? "text-[#3F7A4E]" : "text-[#8F641B]")}
      fill="none"
    >
      <path
        d={positive ? "M2.25 7.75 6 4l3.75 3.75M6 4v6" : "M2.25 4.25 6 8l3.75-3.75M6 8V2"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function 结果空状态({ text }: { text: string }) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center gap-0 text-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION_TIMINGS.fast / 1000, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative flex h-[120px] w-[120px] items-center justify-center">
        <svg className="absolute inset-0" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="24" fill="none" stroke={CHART_COLORS.grid} strokeWidth="0.5" strokeDasharray="3,3" />
          <line x1="60" y1="36" x2="60" y2="84" stroke={CHART_COLORS.grid} strokeWidth="0.5" />
          <line x1="36" y1="60" x2="84" y2="60" stroke={CHART_COLORS.grid} strokeWidth="0.5" />
        </svg>
        <div
          className="relative h-2 w-2 rounded-full animate-float-y"
          style={{
            background: CHART_COLORS.primary,
            boxShadow: "0 2px 6px rgba(217,119,87,0.3)",
          }}
        />
      </div>
      <p className="mt-4 text-[13px] text-stone-500">{text}</p>
    </motion.div>
  );
}

function 图例说明({ hasInteriorGaps, showStaleBand }: { hasInteriorGaps: boolean; showStaleBand: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-stone-500">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: CHART_COLORS.primary }} />
        已知数据
      </span>
      {hasInteriorGaps ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: CHART_COLORS.primary, opacity: 0.6 }} />
          缺数区间
        </span>
      ) : null}
      {showStaleBand ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-4 rounded-[3px]"
            style={{ background: "repeating-linear-gradient(45deg, rgba(120,113,108,0.28) 0 1px, rgba(120,113,108,0.07) 1px 5px)" }}
          />
          日报停更
        </span>
      ) : null}
    </div>
  );
}

function ResultTooltip({
  active,
  payload,
  label,
  formatter,
  personalLabel,
  teamAverageLabel,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; name?: string; value?: number; color?: string }>;
  label?: string;
  formatter: (value: number) => string;
  personalLabel: string;
  teamAverageLabel: string;
}) {
  if (!active || !payload?.length) return null;

  // 桥接虚线与实线共享数值，不进入 tooltip；同 dataKey 只保留一行（修复重复行与 React key 冲突）
  const items = payload.filter(
    (item, index, arr) =>
      item.dataKey !== BRIDGE_KEY &&
      arr.findIndex((other) => other.dataKey === item.dataKey) === index,
  );
  if (!items.length) return null;

  const personalItem = items.find((item) => item.dataKey === personalLabel);
  const teamItem = items.find((item) => item.dataKey === teamAverageLabel);
  const personalValue = typeof personalItem?.value === "number" ? personalItem.value : null;
  const teamValue = typeof teamItem?.value === "number" ? teamItem.value : null;
  const isPositive = personalValue != null && teamValue != null ? personalValue > teamValue : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="min-w-40 rounded-lg border border-stone-200 bg-white p-2.5 shadow-[0_4px_12px_-6px_rgba(28,25,23,0.06)]"
    >
      <p className="text-[12px] tracking-[0.01em] text-stone-500">{label}</p>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => {
          const numericValue = typeof item.value === "number" ? item.value : null;
          const showTrend = item.dataKey === personalLabel && isPositive != null;

          return (
            <div key={item.dataKey} className="flex items-center justify-between gap-3 text-[12px] tabular-nums">
              <span className="flex items-center gap-2 text-stone-500">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.name}
              </span>
              <span className="flex items-center gap-1 text-stone-700">
                {numericValue != null ? <AnimatedNumber value={numericValue} duration={320} /> : "-"}
                {showTrend ? <趋势方向图标 positive={isPositive} /> : null}
                {numericValue != null ? <span className="sr-only">{formatter(numericValue)}</span> : null}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

export function ResultTrend({
  data,
  personalLabel = "个人",
  teamAverageLabel = "团队 P70",
  emptyText = "提交 2 天以上数据后可查看趋势图",
  isLoading = false,
  teamSize,
}: ResultTrendProps) {
  const [metric, setMetric] = useState<MetricKey>("playCount");
  const [range, setRange] = useState<RangeKey>(30);
  const hatchId = useId().replace(/:/g, "");

  const today = useMemo(() => 今天日期字符串(), []);
  const showTeamLine = teamSize === undefined || teamSize >= 5;
  const sorted = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const activeMetric = metricMeta[metric];

  // 稀疏日报 → 连续日序列（日粒度下类目轴均匀排布即真实日期分布），缺失日为 null
  const continuousRows = useMemo(() => {
    const byDate = new Map(sorted.map((item) => [item.date, item]));
    return 补全连续日期(sorted.map((item) => item.date), today).map((date) => {
      const item = byDate.get(date);
      return {
        date,
        personal: (item?.[activeMetric.valueKey] ?? null) as number | null,
        team: (item?.[activeMetric.averageKey] ?? null) as number | null,
      };
    });
  }, [activeMetric, sorted, today]);

  // 最近 N 天按真实日期过滤（替代旧实现"取最后 N 个数据点"）
  const visibleRows = useMemo(() => {
    const from = 平移日期字符串(today, -(range - 1));
    return continuousRows.filter((row) => row.date >= from);
  }, [continuousRows, range, today]);

  // 断流斜纹带：最近一份日报距今天超过阈值时，从次日起标记到今天
  const lastDataDate = useMemo(
    () =>
      continuousRows.reduce<string | null>(
        (max, row) => (row.personal !== null && (!max || row.date > max) ? row.date : max),
        null,
      ),
    [continuousRows],
  );
  const staleDays = lastDataDate ? 日期相差天数(lastDataDate, today) : null;
  const showStaleBand =
    staleDays !== null && staleDays > GROWTH_STALE_DAYS_THRESHOLD && visibleRows.length > 0;
  const staleBandStart = useMemo(() => {
    if (!showStaleBand || !lastDataDate) return null;
    const start = 平移日期字符串(lastDataDate, 1);
    const firstVisible = visibleRows[0]?.date ?? start;
    return start < firstVisible ? firstVisible : start;
  }, [showStaleBand, lastDataDate, visibleRows]);
  const staleBandEnd = showStaleBand ? (visibleRows[visibleRows.length - 1]?.date ?? today) : null;

  // 是否存在"已知数据之间的"缺数区间（尾部断流不算内部缺口）
  const hasInteriorGaps = useMemo(() => {
    let seenData = false;
    for (const row of visibleRows) {
      if (row.personal !== null) {
        seenData = true;
      } else if (seenData) {
        return true;
      }
    }
    return false;
  }, [visibleRows]);

  const chartData = useMemo(
    () =>
      visibleRows.map((row) => ({
        date: row.date,
        [personalLabel]: row.personal,
        [teamAverageLabel]: row.team,
        [BRIDGE_KEY]: row.personal,
      })),
    [personalLabel, teamAverageLabel, visibleRows],
  );
  const yAxisUpperBound = useMemo(
    () =>
      getTrendAxisUpperBound(
        chartData.flatMap((item) => [item[personalLabel] as number | null, item[teamAverageLabel] as number | null]),
      ),
    [chartData, personalLabel, teamAverageLabel],
  );

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-[18px] font-medium tracking-tight text-stone-900">结果趋势</h3>
          <p className="text-[12px] text-stone-500">
            {activeMetric.label}按真实日期展示最近 {range} 天
            {showTeamLine ? "，灰线为团队 P70。" : "，团队人数不足 5 人时暂无对比线。"}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 sm:items-end">
          <div className="inline-flex w-fit rounded-xl border border-stone-200 bg-stone-100 p-0.5">
            {(
              [
                ["playCount", "播放量"],
                ["followerGain", "涨粉"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 rounded-lg px-2 text-[12px] text-stone-500 shadow-none transition-colors duration-[var(--duration-micro)] hover:bg-white hover:text-stone-700",
                  metric === key && "border border-stone-200 bg-white text-stone-700",
                )}
                onClick={() => setMetric(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="inline-flex w-fit rounded-xl border border-stone-200 bg-stone-100 p-0.5">
            {([7, 30] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 rounded-lg px-2 text-[12px] text-stone-500 shadow-none transition-colors duration-[var(--duration-micro)] hover:bg-white hover:text-stone-700",
                  range === value && "border border-stone-200 bg-white text-stone-700",
                )}
                onClick={() => setRange(value)}
              >
                {value}天
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 h-[280px] w-full sm:h-[320px]">
        {isLoading ? (
          <ChartSkeleton />
        ) : sorted.length < 2 ? (
          <结果空状态 text={emptyText} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${metric}-${range}`}
              className="flex h-full w-full flex-col"
              style={{ minHeight: 280, minWidth: 0 }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: ANIMATION_TIMINGS.normal / 1000, ease: [0.16, 1, 0.3, 1] }}
            >
              {hasInteriorGaps || showStaleBand ? (
                <div className="pb-2">
                  <图例说明 hasInteriorGaps={hasInteriorGaps} showStaleBand={showStaleBand} />
                </div>
              ) : null}
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                        <rect width="6" height="6" fill="rgba(120,113,108,0.04)" />
                        <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(120,113,108,0.16)" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={CHART_AXIS_TICK}
                      tickMargin={10}
                      tickFormatter={formatDateLabel}
                      interval="preserveStartEnd"
                      minTickGap={36}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={CHART_AXIS_TICK}
                      tickFormatter={activeMetric.formatter}
                      domain={[0, yAxisUpperBound]}
                      width={56}
                    />
                    <Tooltip
                      content={
                        <ResultTooltip
                          formatter={activeMetric.formatter}
                          personalLabel={personalLabel}
                          teamAverageLabel={teamAverageLabel}
                        />
                      }
                      cursor={{ stroke: "rgba(28,25,23,0.1)", strokeWidth: 1 }}
                    />
                    {showStaleBand && staleBandStart && staleBandEnd ? (
                      <ReferenceArea
                        x1={staleBandStart}
                        x2={staleBandEnd}
                        fill={`url(#${hatchId})`}
                        stroke="none"
                        label={{ value: "日报停更 · 数据中断", position: "insideTop", fill: "#78716c", fontSize: 11 }}
                      />
                    ) : null}
                    {/* 缺数桥接虚线：connectNulls 把已知点跨缺口连起来，只画在实线底下 */}
                    <Line
                      type="monotone"
                      dataKey={BRIDGE_KEY}
                      stroke={CHART_COLORS.primary}
                      strokeOpacity={0.35}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey={personalLabel}
                      name={personalLabel}
                      stroke={CHART_COLORS.primary}
                      strokeWidth={2}
                      dot={{ r: 2, fill: CHART_COLORS.primary, strokeWidth: 0 }}
                      activeDot={<ChartActiveDot />}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                    {showTeamLine ? (
                      <Line
                        type="monotone"
                        dataKey={teamAverageLabel}
                        name={teamAverageLabel}
                        stroke={CHART_COLORS.muted}
                        strokeWidth={1}
                        dot={false}
                        activeDot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
