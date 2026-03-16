"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Report {
  id: string;
  submitter: string;
  report_date: string;
  play_count: number | null;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
}

interface PersonnelAnalysisProps {
  reports: Report[];
}

type SortKey = "hitRate" | "stability" | "trend" | "engagementRate";

interface PersonStats {
  name: string;
  count: number;
  hitRate: number;
  stability: number;
  trend: number;
  engagementRate: number;
  totalPlay: number;
  suggestion: { label: string; color: string };
}

function getSuggestion(p: { hitRate: number; stability: number; trend: number; engagementRate: number }): { label: string; color: string } {
  // 波动异常：稳定性极差
  if (p.stability >= 15) return { label: "波动异常", color: "bg-orange-100 text-orange-700 border-orange-300" };
  // 需要辅导：爆款率低 + 趋势下滑或互动差
  if (p.hitRate < 20 && (p.trend < -10 || p.engagementRate < 2)) return { label: "需要辅导", color: "bg-red-100 text-red-700 border-red-300" };
  // 重点关注：趋势明显下滑
  if (p.trend < -10) return { label: "重点关注", color: "bg-yellow-100 text-yellow-700 border-yellow-300" };
  // 继续放量：爆款率高 + 趋势上升或稳定
  if (p.hitRate >= 30 && p.trend >= 0) return { label: "继续放量", color: "bg-green-100 text-green-700 border-green-300" };
  // 默认：保持观察
  return { label: "保持观察", color: "bg-gray-100 text-gray-600 border-gray-300" };
}

/* Compute team P70 per date */
function computeP70Map(reports: Report[]): Map<string, number> {
  const byDate = new Map<string, number[]>();
  for (const r of reports) {
    const arr = byDate.get(r.report_date) ?? [];
    arr.push(r.play_count ?? 0);
    byDate.set(r.report_date, arr);
  }
  const result = new Map<string, number>();
  for (const [date, values] of byDate) {
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.max(0, Math.ceil(sorted.length * 0.7) - 1);
    result.set(date, sorted[idx]);
  }
  return result;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function PersonnelAnalysis({ reports }: PersonnelAnalysisProps) {
  const [sortBy, setSortBy] = useState<SortKey>("hitRate");

  const stats = useMemo(() => {
    const p70Map = computeP70Map(reports);
    const byPerson = new Map<string, Report[]>();
    for (const r of reports) {
      const arr = byPerson.get(r.submitter) ?? [];
      arr.push(r);
      byPerson.set(r.submitter, arr);
    }

    const today = new Date().toISOString().split("T")[0];
    const sevenAgoDate = new Date();
    sevenAgoDate.setDate(sevenAgoDate.getDate() - 7);
    const sevenAgo = sevenAgoDate.toISOString().split("T")[0];
    const fourteenAgoDate = new Date();
    fourteenAgoDate.setDate(fourteenAgoDate.getDate() - 14);
    const fourteenAgo = fourteenAgoDate.toISOString().split("T")[0];

    const result: PersonStats[] = [];

    for (const [name, personReports] of byPerson) {
      const plays = personReports.map((r) => r.play_count ?? 0);
      const totalPlay = plays.reduce((a, b) => a + b, 0);
      const totalEng = personReports.reduce((sum, r) => sum + r.likes + r.comments + r.shares + r.favorites, 0);

      // 爆款率: play > P70 of that date
      let hitCount = 0;
      for (const r of personReports) {
        const p70 = p70Map.get(r.report_date) ?? 0;
        if ((r.play_count ?? 0) > p70) hitCount++;
      }
      const hitRate = personReports.length > 0 ? hitCount / personReports.length * 100 : 0;

      // 稳定性: stddev of play counts (normalized to 万)
      const stability = stdDev(plays.map((p) => p / 10000));

      // 趋势: recent 7d avg vs previous 7d avg
      const recent = personReports.filter((r) => r.report_date >= sevenAgo && r.report_date <= today);
      const prev = personReports.filter((r) => r.report_date >= fourteenAgo && r.report_date < sevenAgo);
      const recentAvg = recent.length > 0 ? recent.reduce((s, r) => s + (r.play_count ?? 0), 0) / recent.length : 0;
      const prevAvg = prev.length > 0 ? prev.reduce((s, r) => s + (r.play_count ?? 0), 0) / prev.length : 0;
      const trend = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;

      // 互动效率
      const engagementRate = totalPlay > 0 ? (totalEng / totalPlay) * 100 : 0;

      const suggestion = getSuggestion({ hitRate, stability, trend, engagementRate });
      result.push({ name, count: personReports.length, hitRate, stability, trend, engagementRate, totalPlay, suggestion });
    }

    return result;
  }, [reports]);

  const sorted = useMemo(() => {
    return [...stats].sort((a, b) => {
      if (sortBy === "hitRate") return b.hitRate - a.hitRate;
      if (sortBy === "stability") return a.stability - b.stability; // lower = better
      if (sortBy === "trend") return b.trend - a.trend;
      return b.engagementRate - a.engagementRate;
    });
  }, [stats, sortBy]);

  if (stats.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">暂无数据</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center">排序：</span>
        {([["hitRate", "爆款率"], ["stability", "稳定性"], ["trend", "趋势"], ["engagementRate", "互动效率"]] as const).map(([key, label]) => (
          <Button key={key} size="sm" variant={sortBy === key ? "default" : "outline"} onClick={() => setSortBy(key)}>
            {label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((p) => (
          <div key={p.name} className="rounded-lg border bg-background p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{p.name}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${p.suggestion.color}`}>{p.suggestion.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{p.count} 条数据</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">爆款率</p>
                <Badge variant={p.hitRate >= 40 ? "default" : p.hitRate >= 20 ? "secondary" : "outline"} className={p.hitRate >= 40 ? "bg-green-500" : p.hitRate < 20 ? "text-red-500 border-red-300" : ""}>
                  {p.hitRate.toFixed(1)}%
                </Badge>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">稳定性</p>
                <Badge variant={p.stability < 5 ? "default" : p.stability < 15 ? "secondary" : "outline"} className={p.stability < 5 ? "bg-green-500" : p.stability >= 15 ? "text-red-500 border-red-300" : ""}>
                  {p.stability < 5 ? "稳定" : p.stability < 15 ? "一般" : "波动大"}
                </Badge>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">趋势</p>
                <Badge variant={p.trend > 10 ? "default" : p.trend < -10 ? "outline" : "secondary"} className={p.trend > 10 ? "bg-green-500" : p.trend < -10 ? "text-red-500 border-red-300" : ""}>
                  {p.trend > 0 ? "+" : ""}{p.trend.toFixed(1)}%
                </Badge>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">互动效率</p>
                <Badge variant={p.engagementRate >= 5 ? "default" : p.engagementRate >= 2 ? "secondary" : "outline"} className={p.engagementRate >= 5 ? "bg-green-500" : p.engagementRate < 2 ? "text-red-500 border-red-300" : ""}>
                  {p.engagementRate.toFixed(2)}%
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
