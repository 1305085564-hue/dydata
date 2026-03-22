"use client";

import { useMemo } from "react";
import { Clock } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { EmptyState } from "@/components/ui/empty-state";

interface Report {
  id: string;
  report_date: string;
  play_count: number | null;
  follower_gain: number;
  follower_convert: number | null;
  published_at?: string | null;
  uploaded_at?: string;
}

interface TimeAnalysisProps {
  reports: Report[];
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const TIME_SLOTS = [
  { label: "早间(6-12)", min: 6, max: 12 },
  { label: "午间(12-14)", min: 12, max: 14 },
  { label: "下午(14-18)", min: 14, max: 18 },
  { label: "晚间(18-22)", min: 18, max: 22 },
  { label: "深夜(22-6)", min: 22, max: 6 },
];

function getTimeSlot(hour: number): string {
  if (hour >= 6 && hour < 12) return "早间(6-12)";
  if (hour >= 12 && hour < 14) return "午间(12-14)";
  if (hour >= 14 && hour < 18) return "下午(14-18)";
  if (hour >= 18 && hour < 22) return "晚间(18-22)";
  return "深夜(22-6)";
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card-static rounded-2xl px-3 py-2">
      <p className="text-xs font-semibold tracking-tight">{label}</p>
      <p className="text-xs tabular-nums text-blue-500">平均播放：{payload[0].value.toFixed(2)}万</p>
    </div>
  );
}

export function TimeAnalysis({ reports }: TimeAnalysisProps) {
  const publishedCount = reports.filter((r) => r.published_at).length;
  const hasEnoughPublished = publishedCount >= 5;

  const weekdayData = useMemo(() => {
    const source = hasEnoughPublished ? reports.filter((r) => r.published_at) : reports;
    const buckets: { total: number; count: number }[] = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));

    for (const r of source) {
      const dateStr = hasEnoughPublished ? r.published_at! : r.report_date;
      const day = new Date(dateStr).getDay();
      buckets[day].total += (r.play_count ?? 0) / 10000;
      buckets[day].count += 1;
    }

    return WEEKDAYS.map((label, i) => ({
      name: label,
      "平均播放(万)": buckets[i].count > 0 ? +(buckets[i].total / buckets[i].count).toFixed(2) : 0,
    }));
  }, [reports, hasEnoughPublished]);

  const timeSlotData = useMemo(() => {
    if (!hasEnoughPublished) return null;
    const withTime = reports.filter((r) => r.published_at);
    const buckets = new Map<string, { total: number; count: number }>();
    for (const slot of TIME_SLOTS) buckets.set(slot.label, { total: 0, count: 0 });

    for (const r of withTime) {
      const hour = new Date(r.published_at!).getHours();
      const slot = getTimeSlot(hour);
      const b = buckets.get(slot)!;
      b.total += (r.play_count ?? 0) / 10000;
      b.count += 1;
    }

    return TIME_SLOTS.map((slot) => {
      const b = buckets.get(slot.label)!;
      return {
        name: slot.label,
        "平均播放(万)": b.count > 0 ? +(b.total / b.count).toFixed(2) : 0,
      };
    });
  }, [reports, hasEnoughPublished]);

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="暂无时间维度数据"
        description="成员提交数据后可查看发布时段与星期的播放量分布"
      />
    );
  }

  return (
    <div className="space-y-6">
      {!hasEnoughPublished && (
        <div className="glass-card-static rounded-2xl p-3">
          <p className="text-xs text-muted-foreground">
            {publishedCount === 0
              ? "暂无发布时间数据，按提交日期分析星期分布。填写「发布时间」后可解锁时间段分析。"
              : `发布时间数据积累中（${publishedCount}/5），需要更多数据后才能展示时间段分析。当前按提交日期分析星期分布。`}
          </p>
        </div>
      )}

      <div className="glass-card-static rounded-2xl p-4">
        <h4 className="mb-3 text-sm font-semibold tracking-tight text-foreground">按星期分布</h4>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={weekdayData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6b7280" }} />
            <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} unit="万" />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="平均播放(万)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {timeSlotData && (
        <div className="glass-card-static rounded-2xl p-4">
          <h4 className="mb-3 text-sm font-semibold tracking-tight text-foreground">按时间段分布</h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={timeSlotData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6b7280" }} />
              <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} unit="万" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="平均播放(万)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
