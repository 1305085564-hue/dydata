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
    <div className="glass-card-static rounded-2xl px-3 py-2">
      <p className="text-xs font-semibold tracking-tight">{label}</p>
      <p className="text-xs tabular-nums text-blue-500">
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

    // build date list
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }

    // aggregate by date
    const byDate = new Map<string, number>();
    for (const r of reports) {
      if (!dates.includes(r.report_date)) continue;
      byDate.set(r.report_date, (byDate.get(r.report_date) ?? 0) + (r.follower_convert ?? 0));
    }

    return dates.map((date) => ({
      date: date.slice(5), // MM-DD
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
    <div className="glass-card-static rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold tracking-tight text-foreground">导粉趋势</h4>
        <div className="flex gap-1">
          {(["7d", "30d"] as Preset[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={preset === p ? "default" : "ghost"}
              className="h-6 px-2 text-xs"
              onClick={() => setPreset(p)}
            >
              {p === "7d" ? "近7天" : "近30天"}
            </Button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6b7280" }} />
          <YAxis
            tick={{ fontSize: 12, fill: "#6b7280" }}
            domain={[0, yUpperBound]}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="导粉量"
            stroke="#007AFF"
            strokeWidth={2}
            dot={{ r: 3, fill: "#007AFF" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
