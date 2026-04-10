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
import { getTrendAxisUpperBound } from "@/lib/趋势图";
import { cn } from "@/lib/utils";
import { ChartSkeleton } from "./chart-skeleton";

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
      className={cn("h-3 w-3", positive ? "text-[var(--color-success)]" : "text-[var(--color-warning)]")}
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
      className="flex h-full flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border/70 bg-muted/[0.18] px-6 text-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION_TIMINGS.fast / 1000, ease: [0.16, 1, 0.3, 1] }}
    >
      <svg aria-hidden="true" viewBox="0 0 220 120" className="h-28 w-full max-w-[220px] text-slate-300">
        <path d="M18 96H202" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
        <path d="M24 26V96" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
        <path d="M34 82c15-10 23-16 33-11 11 5 18 19 28 18 14-1 20-26 33-26 10 0 16 11 25 11 10 0 18-10 29-15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M34 69c12-7 20-10 28-7 12 4 20 19 32 17 10-2 17-13 26-13 8 0 14 7 24 7 8 0 15-6 24-10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5" />
        <path d="M34 58c11-6 18-9 25-8 10 1 20 12 31 10 9-2 16-10 24-10 8 0 13 6 20 6 7 0 14-4 20-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.32" />
      </svg>
      <p className="text-sm text-muted-foreground">{text}</p>
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
      className="min-w-40 rounded-[16px] border border-white/70 bg-[var(--glass-bg)] px-3 py-2.5 shadow-[var(--shadow-toast)] backdrop-blur-[20px]"
    >
      <p className="text-[11px] font-medium tracking-[0.01em] text-foreground/70">{label}</p>
      <div className="mt-2 space-y-1.5">
        {payload.map((item) => {
          const numericValue = typeof item.value === "number" ? item.value : null;
          const showTrend = item.dataKey === personalLabel && isPositive != null;

          return (
            <div key={item.dataKey} className="flex items-center justify-between gap-3 text-xs tabular-nums">
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
  teamAverageLabel = "团队 P80",
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
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">互动质量分趋势</h3>
          <p className="text-xs text-muted-foreground">评论×0.35 + 分享×0.25 + 点赞×0.25 + 收藏×0.15</p>
        </div>
        <div className="inline-flex w-fit rounded-xl border border-border/70 bg-muted/45 p-0.5 backdrop-blur">
          {([7, 30] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant="ghost"
              className={cn(
                "h-7 rounded-lg px-2 text-[11px] font-medium text-muted-foreground shadow-none transition-[transform,filter,background-color,color,box-shadow] duration-[var(--duration-micro)] ease-[var(--ease-spring)] hover:scale-[1.01] hover:brightness-105 active:scale-[0.98]",
                range === value && "bg-background text-foreground shadow-sm"
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
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgba(15,23,42,0.08)" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "rgba(15,23,42,0.45)" }}
                    tickMargin={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "rgba(15,23,42,0.45)" }}
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
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: "#3B82F6", stroke: "white", strokeWidth: 2 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={teamAverageLabel}
                    name={teamAverageLabel}
                    stroke="#F97316"
                    strokeWidth={2.5}
                    dot={false}
                    strokeDasharray="4 5"
                    activeDot={{ r: 4, fill: "#F97316", stroke: "white", strokeWidth: 2 }}
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
