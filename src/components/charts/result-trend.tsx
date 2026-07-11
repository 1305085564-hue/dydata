"use client";

import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedNumber } from "@/components/animated-number";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { getTrendAxisUpperBound } from "@/lib/趋势图";
import { ANIMATION_TIMINGS } from "@/lib/animations";
import {
  CHART_AXIS_TICK,
  CHART_COLORS,
  CHART_GRADIENT_PRIMARY,
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
}

type MetricKey = "playCount" | "followerGain";
type RangeKey = 7 | 30;

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

function 趋势方向图标({ positive }: { positive: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={cn("h-3 w-3", positive ? "text-[#6FAA7D]" : "text-[#D99E55]")}
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

  const personalItem = payload.find((item) => item.dataKey === personalLabel);
  const teamItem = payload.find((item) => item.dataKey === teamAverageLabel);
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
        {payload.map((item) => {
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
}: ResultTrendProps) {
  const [metric, setMetric] = useState<MetricKey>("playCount");
  const [range, setRange] = useState<RangeKey>(7);
  const gradientId = useId().replace(/:/g, "");

  const sorted = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const visibleData = useMemo(() => sorted.slice(-range), [range, sorted]);

  const activeMetric = metricMeta[metric];
  const chartData = useMemo(
    () =>
      visibleData.map((item) => ({
        date: formatDateLabel(item.date),
        [personalLabel]: item[activeMetric.valueKey] as number | null,
        [teamAverageLabel]: item[activeMetric.averageKey] as number | null,
      })),
    [activeMetric.averageKey, activeMetric.valueKey, personalLabel, teamAverageLabel, visibleData]
  );
  const yAxisUpperBound = useMemo(
    () =>
      getTrendAxisUpperBound(
        chartData.flatMap((item) => [item[personalLabel] as number | null, item[teamAverageLabel] as number | null])
      ),
    [chartData, personalLabel, teamAverageLabel]
  );

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-[18px] font-medium tracking-tight text-stone-900">结果趋势</h3>
          <p className="text-[12px] text-stone-500">{activeMetric.label}对比团队 P70，保留最近 {range} 天，并优先展示趋势方向。</p>
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
                  metric === key && "border border-stone-200 bg-white text-stone-700"
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
                  range === value && "border border-stone-200 bg-white text-stone-700"
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
              className="h-full w-full"
              style={{ minHeight: 280, minWidth: 0 }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: ANIMATION_TIMINGS.normal / 1000, ease: [0.16, 1, 0.3, 1] }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_GRADIENT_PRIMARY.from} stopOpacity={0.03} />
                      <stop offset="100%" stopColor={CHART_GRADIENT_PRIMARY.from} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID_PROPS} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={CHART_AXIS_TICK}
                    tickMargin={10}
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
                  <Area
                    type="monotone"
                    dataKey={personalLabel}
                    fill={`url(#${gradientId})`}
                    stroke="none"
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={personalLabel}
                    name={personalLabel}
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    dot={false}
                    activeDot={<ChartActiveDot />}
                    connectNulls
                    isAnimationActive={false}
                  />
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
                </ComposedChart>
              </ResponsiveContainer>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
