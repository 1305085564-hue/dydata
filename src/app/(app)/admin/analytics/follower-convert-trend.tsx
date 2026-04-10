"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

interface Report {
  report_date: string;
  follower_convert: number | null;
}

interface FollowerConvertTrendProps {
  reports: Report[];
}

type Preset = "7d" | "30d";

function getTrendAxisUpperBound(max: number): number {
  if (max <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / magnitude) * magnitude;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card-static rounded-2xl px-3 py-2.5 shadow-[var(--shadow-light)]">
      <p className="text-xs font-semibold tracking-tight text-[var(--color-text-primary)]">{label}</p>
      <p className="mt-1 text-xs tabular-nums text-[var(--color-primary)]">
        导粉：{payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

export function FollowerConvertTrend({ reports }: FollowerConvertTrendProps) {
  const [preset, setPreset] = useState<Preset>("7d");

  const chartData = useMemo(() => {
    const days = preset === "7d" ? 7 : 30;
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }

    const byDate = new Map<string, number>();
    for (const r of reports) {
      if (!dates.includes(r.report_date)) continue;
      byDate.set(r.report_date, (byDate.get(r.report_date) ?? 0) + (r.follower_convert ?? 0));
    }

    return dates.map((date) => ({
      date: date.slice(5),
      导粉量: byDate.get(date) ?? 0,
    }));
  }, [reports, preset]);

  const maxVal = Math.max(...chartData.map((d) => d.导粉量), 0);
  const yUpperBound = getTrendAxisUpperBound(maxVal);

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="暂无导粉数据"
        description="成员填写导粉数据后可查看趋势图"
      />
    );
  }

  return (
    <section className="glass-card-static p-4 sm:p-5">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">导粉趋势</h3>
          <p className="text-xs text-muted-foreground">按最近 {preset === "7d" ? "7" : "30"} 天查看团队导粉变化</p>
        </div>
        <div className="inline-flex w-fit rounded-xl border border-border/70 bg-muted/45 p-0.5 backdrop-blur">
          {(["7d", "30d"] as Preset[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant="ghost"
              className={cn(
                "h-7 rounded-lg px-2 text-[11px] font-medium text-muted-foreground shadow-none transition-[transform,filter,background-color,color,box-shadow] duration-[var(--duration-micro)] ease-[var(--ease-spring)] hover:scale-[1.01] hover:brightness-105 active:scale-[0.98]",
                preset === p && "bg-background text-foreground shadow-sm"
              )}
              onClick={() => setPreset(p)}
            >
              {p === "7d" ? "近7天" : "近30天"}
            </Button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(15,23,42,0.08)" />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "rgba(15,23,42,0.45)" }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 12, fill: "rgba(15,23,42,0.45)" }}
            domain={[0, yUpperBound]}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(15,23,42,0.1)", strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="导粉量"
            stroke="#3B82F6"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: "#3B82F6", stroke: "white", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
