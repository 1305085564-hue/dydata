"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";

interface ReportRow {
  report_date: string;
  play_count: number | null;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
}

interface PercentileData {
  p50_play: number; p70_play: number; p90_play: number;
  p50_eng: number; p70_eng: number; p90_eng: number;
}

interface TrendChartProps {
  history: ReportRow[];
  teamPercentiles?: Record<string, PercentileData>;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-xs tabular-nums" style={{ color: p.color }}>
          {p.name}：{typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
}

export function TrendChart({ history, teamPercentiles }: TrendChartProps) {
  const [range, setRange] = useState<7 | 30>(7);

  const sorted = [...history]
    .sort((a, b) => a.report_date.localeCompare(b.report_date))
    .slice(-range);

  const chartData = sorted.map((r) => {
    const pct = teamPercentiles?.[r.report_date];
    return {
      date: r.report_date.slice(5),
      "播放量(万)": r.play_count != null ? +(r.play_count / 10000).toFixed(2) : 0,
      "中位线P50(万)": pct ? +(pct.p50_play / 10000).toFixed(2) : undefined,
      "达标线P70(万)": pct ? +(pct.p70_play / 10000).toFixed(2) : undefined,
      "优秀线P90(万)": pct ? +(pct.p90_play / 10000).toFixed(2) : undefined,
    };
  });

  const interactionData = sorted.map((r) => {
    const pct = teamPercentiles?.[r.report_date];
    return {
      date: r.report_date.slice(5),
      点赞: r.likes,
      评论: r.comments,
      分享: r.shares,
      收藏: r.favorites,
      "中位线P50": pct?.p50_eng ?? undefined,
      "达标线P70": pct?.p70_eng ?? undefined,
      "优秀线P90": pct?.p90_eng ?? undefined,
    };
  });

  if (history.length < 2) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        提交 2 天以上数据后可查看趋势图
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button variant={range === 7 ? "default" : "outline"} size="sm" onClick={() => setRange(7)}>近 7 天</Button>
        <Button variant={range === 30 ? "default" : "outline"} size="sm" onClick={() => setRange(30)}>近 30 天</Button>
      </div>

      <div>
        <h4 className="text-sm font-medium text-foreground mb-3">播放量趋势</h4>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={{ stroke: "#d1d5db" }} />
            <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={{ stroke: "#d1d5db" }} unit="万" />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Line type="monotone" dataKey="播放量(万)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6, fill: "#2563eb" }} />
            <Line type="monotone" dataKey="中位线P50(万)" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
            <Line type="monotone" dataKey="达标线P70(万)" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
            <Line type="monotone" dataKey="优秀线P90(万)" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="8 4" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="text-sm font-medium text-foreground mb-3">互动数据趋势</h4>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={interactionData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={{ stroke: "#d1d5db" }} />
            <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={{ stroke: "#d1d5db" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Line type="monotone" dataKey="点赞" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3, fill: "#f97316", strokeWidth: 2, stroke: "#fff" }} />
            <Line type="monotone" dataKey="评论" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 3, fill: "#06b6d4", strokeWidth: 2, stroke: "#fff" }} />
            <Line type="monotone" dataKey="分享" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3, fill: "#8b5cf6", strokeWidth: 2, stroke: "#fff" }} />
            <Line type="monotone" dataKey="收藏" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }} />
            <Line type="monotone" dataKey="中位线P50" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
            <Line type="monotone" dataKey="达标线P70" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
            <Line type="monotone" dataKey="优秀线P90" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="8 4" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
