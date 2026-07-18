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
import {
  CHART_AXIS_TICK,
  CHART_GRID_PROPS,
} from "@/lib/chart-palette";
import { ChartActiveDot } from "@/components/charts/chart-active-dot";
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
    <div className="rounded-lg border border-stone-200 bg-white p-2.5 shadow-[0_4px_12px_-6px_rgba(15,23,42,0.06)]">
      <p className="text-[12px] font-medium tracking-tight text-stone-700">{label}</p>
      <p className="mt-1 text-[12px] tabular-nums text-[#D97757]">
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
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <h3 className="text-[18px] font-medium tracking-tight text-stone-900">导粉趋势</h3>
          <p className="text-[12px] text-stone-500">按最近 {preset === "7d" ? "7" : "30"} 天查看团队导粉变化</p>
        </div>
        <div className="inline-flex w-fit rounded-lg border border-stone-200 bg-stone-50 p-0.5">
          {(["7d", "30d"] as Preset[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant="ghost"
              className={cn(
                "h-7 rounded-md px-2 text-[12px] font-normal text-stone-500 shadow-none transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                preset === p && "bg-white text-stone-900"
              )}
              onClick={() => setPreset(p)}
            >
              {p === "7d" ? "近7天" : "近30天"}
            </Button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="date" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis
            tick={CHART_AXIS_TICK}
            domain={[0, yUpperBound]}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(15,23,42,0.1)", strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="导粉量"
            stroke="#D97757"
            strokeWidth={2}
            dot={false}
            activeDot={<ChartActiveDot />}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
