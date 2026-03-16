"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
}

type RangeKey = 7 | 30;

function formatDateLabel(value: string) {
  return value.length >= 10 ? value.slice(5) : value;
}

function InteractionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-36 rounded-2xl border border-white/70 bg-white/88 px-3 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <p className="text-[11px] font-medium tracking-[0.01em] text-foreground/70">{label}</p>
      <div className="mt-2 space-y-1.5">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-3 text-xs tabular-nums">
            <span className="flex items-center gap-2 text-foreground/70">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-medium text-foreground">{typeof item.value === "number" ? item.value.toLocaleString() : "-"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InteractionTrend({
  data,
  personalLabel = "个人",
  teamAverageLabel = "团队平均",
  emptyText = "提交 2 天以上数据后可查看趋势图",
}: InteractionTrendProps) {
  const [range, setRange] = useState<RangeKey>(7);

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

  if (sorted.length < 2) {
    return <p className="py-6 text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <section className="rounded-[1rem] border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur-xl sm:p-5">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">互动质量分趋势</h3>
          <p className="text-xs font-light text-muted-foreground">评论×0.35 + 分享×0.25 + 点赞×0.25 + 收藏×0.15</p>
        </div>
        <div className="inline-flex rounded-2xl border border-border/70 bg-muted/45 p-1 backdrop-blur">
          {([7, 30] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant="ghost"
              className={cn(
                "rounded-xl px-3 text-xs font-medium text-muted-foreground shadow-none",
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
        <AnimatePresence mode="wait">
          <motion.div
            key={String(range)}
            className="h-full w-full"
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 220, damping: 26, mass: 0.9 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
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
                  width={56}
                />
                <Tooltip content={<InteractionTooltip />} cursor={{ stroke: "rgba(15,23,42,0.1)", strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey={personalLabel}
                  name={personalLabel}
                  stroke="rgb(37, 99, 235)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "rgb(37, 99, 235)", stroke: "white", strokeWidth: 2 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey={teamAverageLabel}
                  name={teamAverageLabel}
                  stroke="rgba(15, 23, 42, 0.35)"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 5"
                  activeDot={{ r: 4, fill: "rgba(15, 23, 42, 0.55)", stroke: "white", strokeWidth: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
