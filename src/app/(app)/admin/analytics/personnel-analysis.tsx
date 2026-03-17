"use client";

import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  follower_gain: number;
  follower_convert: number | null;
  published_at?: string | null;
  uploaded_at?: string;
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
  const [expanded, setExpanded] = useState(false);

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

      let hitCount = 0;
      for (const r of personReports) {
        const p70 = p70Map.get(r.report_date) ?? 0;
        if ((r.play_count ?? 0) > p70) hitCount++;
      }
      const hitRate = personReports.length > 0 ? (hitCount / personReports.length) * 100 : 0;
      const stability = stdDev(plays.map((p) => p / 10000));
      const recent = personReports.filter((r) => r.report_date >= sevenAgo && r.report_date <= today);
      const prev = personReports.filter((r) => r.report_date >= fourteenAgo && r.report_date < sevenAgo);
      const recentAvg = recent.length > 0 ? recent.reduce((s, r) => s + (r.play_count ?? 0), 0) / recent.length : 0;
      const prevAvg = prev.length > 0 ? prev.reduce((s, r) => s + (r.play_count ?? 0), 0) / prev.length : 0;
      const trend = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;
      const engagementRate = totalPlay > 0 ? (totalEng / totalPlay) * 100 : 0;
      const suggestion = getSuggestion({ hitRate, stability, trend, engagementRate });
      result.push({ name, count: personReports.length, hitRate, stability, trend, engagementRate, totalPlay, suggestion });
    }

    return result;
  }, [reports]);

  const sorted = useMemo(() => {
    return [...stats].sort((a, b) => {
      if (sortBy === "hitRate") return b.hitRate - a.hitRate;
      if (sortBy === "stability") return a.stability - b.stability;
      if (sortBy === "trend") return b.trend - a.trend;
      return b.engagementRate - a.engagementRate;
    });
  }, [stats, sortBy]);

  const visibleItems = sorted.slice(0, 5);
  const hiddenItems = sorted.slice(5);

  if (stats.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">暂无数据</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className="self-center text-xs text-muted-foreground">排序：</span>
        {([
          ["hitRate", "爆款率"],
          ["stability", "稳定性"],
          ["trend", "趋势"],
          ["engagementRate", "互动效率"],
        ] as const).map(([key, label]) => (
          <Button key={key} size="sm" variant={sortBy === key ? "default" : "outline"} onClick={() => setSortBy(key)}>
            {label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((p) => (
          <PersonCard key={p.name} person={p} />
        ))}
      </div>

      <AnimatePresence initial={false}>
        {expanded && hiddenItems.length > 0 ? (
          <motion.div
            key="more-people"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
              {hiddenItems.map((p) => (
                <motion.div
                  key={p.name}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <PersonCard person={p} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {hiddenItems.length > 0 ? (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "收起" : `展开更多（+${hiddenItems.length}）`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PersonCard({ person }: { person: PersonStats }) {
  return (
    <div className="glass-card-static space-y-3 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold tracking-tight">{person.name}</p>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${person.suggestion.color}`}>
            {person.suggestion.label}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{person.count} 条数据</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">爆款率</p>
          <Badge
            variant={person.hitRate >= 40 ? "default" : person.hitRate >= 20 ? "secondary" : "outline"}
            className={person.hitRate >= 40 ? "bg-green-500" : person.hitRate < 20 ? "border-red-300 text-red-500" : ""}
          >
            <span className="tabular-nums">{person.hitRate.toFixed(1)}%</span>
          </Badge>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">稳定性</p>
          <Badge
            variant={person.stability < 5 ? "default" : person.stability < 15 ? "secondary" : "outline"}
            className={person.stability < 5 ? "bg-green-500" : person.stability >= 15 ? "border-red-300 text-red-500" : ""}
          >
            {person.stability < 5 ? "稳定" : person.stability < 15 ? "一般" : "波动大"}
          </Badge>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">趋势</p>
          <Badge
            variant={person.trend > 10 ? "default" : person.trend < -10 ? "outline" : "secondary"}
            className={person.trend > 10 ? "bg-green-500" : person.trend < -10 ? "border-red-300 text-red-500" : ""}
          >
            <span className="tabular-nums">
              {person.trend > 0 ? "+" : ""}
              {person.trend.toFixed(1)}%
            </span>
          </Badge>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">互动效率</p>
          <Badge
            variant={person.engagementRate >= 5 ? "default" : person.engagementRate >= 2 ? "secondary" : "outline"}
            className={person.engagementRate >= 5 ? "bg-green-500" : person.engagementRate < 2 ? "border-red-300 text-red-500" : ""}
          >
            <span className="tabular-nums">{person.engagementRate.toFixed(2)}%</span>
          </Badge>
        </div>
      </div>
    </div>
  );
}
