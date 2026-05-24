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
import { ANIMATION_TIMINGS } from "@/lib/animations";
import {
  CHART_AXIS_TICK,
  CHART_COLORS,
  CHART_GRADIENT_PRIMARY,
  CHART_GRID_PROPS,
} from "@/lib/chart-palette";
import { getTrendAxisUpperBound } from "@/lib/趋势图";
import { cn } from "@/lib/utils";
import { ChartSkeleton } from "./chart-skeleton";
import { ChartActiveDot } from "./chart-active-dot";

export interface InteractionTrendDatum {
  date: string;
  score: number | null;
  teamAverageScore: number | null;
}

interface InteractionTrendProps {
  data: InteractionTrendDatum[];
  personalLabel?: string;
  teamAverageLabel?: string;
  emptyText?: string;
  isLoading?: boolean;
}

type RangeKey = 7 | 30;

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

function 趋势空状态({ text }: { text: string }) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center gap-0 text-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION_TIMINGS.fast / 1000, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative flex h-[120px] w-[120px] items-center justify-center">
        <svg className="absolute inset-0" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="24" fill="none" stroke="#D4D4D8" strokeWidth="0.5" strokeDasharray="3,3" />
          <line x1="60" y1="36" x2="60" y2="84" stroke="#E4E4E7" strokeWidth="0.5" />
          <line x1="36" y1="60" x2="84" y2="60" stroke="#E4E4E7" strokeWidth="0.5" />
        </svg>
        <div
          className="relative h-2 w-2 rounded-full animate-float-y"
          style={{
            background: "radial-gradient(circle, #E28D71 0%, #D97757 100%)",
            boxShadow: "0 2px 6px rgba(217,119,87,0.3)",
          }}
        />
      </div>
      <p className="text-[13px] font-medium text-zinc-500 mt-4">{text}</p>
    </motion.div>
  );
}

function InteractionTooltip({
  active,
  payload,
  label,
  personalLabel,
  teamAverageLabel,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; name?: string; value?: number; color?: string }>;
  label?: string;
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
      className="min-w-40 rounded-lg border border-zinc-200 bg-white p-2.5 shadow-[0_4px_12px_-6px_rgba(15,23,42,0.06)]"
    >
      <p className="text-[11px] font-medium tracking-[0.01em] text-foreground/70">{label}</p>
      <div className="mt-2 space-y-1.5">
        {payload.map((item) => {
          const numericValue = typeof item.value === "number" ? item.value : null;
          const showTrend = item.dataKey === personalLabel && isPositive != null;

          return (
            <div key={item.dataKey} className="flex items-center justify-between gap-3 text-xs font-mono tabular-nums">
              <span className="flex items-center gap-2 text-foreground/70">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.name}
              </span>
              <span className="flex items-center gap-1 font-medium text-foreground">
                {numericValue != null ? <AnimatedNumber value={numericValue} duration={280} /> : "-"}
                {showTrend ? <趋势方向图标 positive={isPositive} /> : null}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

export function InteractionTrend({
  data,
  personalLabel = "个人",
  teamAverageLabel = "团队 P70",
  emptyText = "提交 2 天以上数据后可查看趋势图",
  isLoading = false,
}: InteractionTrendProps) {
  const [range, setRange] = useState<RangeKey>(7);
  const gradientId = useId().replace(/:/g, "");

  const sorted = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const visibleData = useMemo(() => sorted.slice(-range), [range, sorted]);
  const chartData = useMemo(
    () =>
      visibleData.map((item) => ({
        date: formatDateLabel(item.date),
        [personalLabel]: item.score,
        [teamAverageLabel]: item.teamAverageScore,
      })),
    [personalLabel, teamAverageLabel, visibleData]
  );
  const yAxisUpperBound = useMemo(
    () =>
      getTrendAxisUpperBound(
        chartData.flatMap((item) => [item[personalLabel] as number | null, item[teamAverageLabel] as number | null])
      ),
    [chartData, personalLabel, teamAverageLabel]
  );

  return (
    <section className="glass-card-static p-4 sm:p-5">
      <div className="flex flex-col gap-2 border-b border-border/60 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-[18px] font-medium tracking-tight text-foreground">互动质量分趋势</h3>
          <p className="text-xs text-muted-foreground">评论×0.35 + 分享×0.25 + 点赞×0.25 + 收藏×0.15</p>
        </div>
        <div className="inline-flex w-fit rounded-xl border border-border/70 bg-muted/45 p-0.5 backdrop-blur">
          {([7, 30] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant="ghost"
              className={cn(
                "h-7 rounded-lg px-2 text-[11px] font-medium text-muted-foreground shadow-none transition-[transform,filter,background-color,color,box-shadow] duration-[var(--duration-micro)] ease-[var(--ease-spring)]] hover:brightness-105]",
                range === value && "glass-panel text-foreground shadow-sm"
              )}
              onClick={() => setRange(value)}
            >
              {value}天
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-[280px] w-full sm:h-[320px]">
        {isLoading ? (
          <ChartSkeleton />
        ) : sorted.length < 2 ? (
          <趋势空状态 text={emptyText} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={String(range)}
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
                      <stop offset="0%" stopColor="#D97757" stopOpacity={0.03} />
                      <stop offset="100%" stopColor="#D97757" stopOpacity={0} />
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
                    tickFormatter={(value: number) => value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString()}
                    domain={[0, yAxisUpperBound]}
                    width={56}
                  />
                  <Tooltip
                    content={<InteractionTooltip personalLabel={personalLabel} teamAverageLabel={teamAverageLabel} />}
                    cursor={{ stroke: "rgba(15,23,42,0.1)", strokeWidth: 1 }}
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
                    stroke="#D97757"
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
                    stroke="#D4D4D8"
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
