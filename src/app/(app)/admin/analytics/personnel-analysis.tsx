"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MotionCard } from "@/components/ui/motion-card";
import { EmptyState } from "@/components/ui/empty-state";
import { containerVariants, itemVariants, useCountUp } from "@/lib/animations";

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
  title?: string;
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

export function PersonnelAnalysis({ reports, title = "人员深度分析" }: PersonnelAnalysisProps) {
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
    return (
      <EmptyState
        icon={Users}
        title="暂无人员数据"
        description="成员提交数据后可查看各成员的爆款率、稳定性和成长趋势"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight text-[var(--color-text-primary)]">{title}</h3>
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-[var(--color-text-secondary)]">排序：</span>
          {([
            ["hitRate", "爆款率"],
            ["stability", "稳定性"],
            ["trend", "趋势"],
            ["engagementRate", "互动效率"],
          ] as const).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={sortBy === key ? "default" : "outline"}
              className="transition-transform duration-[var(--duration-micro)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.97]"
              onClick={() => setSortBy(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((person, index) => (
          <motion.div key={person.name} variants={itemVariants}>
            <PersonCard person={person} index={index} />
          </motion.div>
        ))}
      </motion.div>

      {expanded && hiddenItems.length > 0 ? (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
          {hiddenItems.map((person, index) => (
            <motion.div key={person.name} variants={itemVariants}>
              <PersonCard person={person} index={visibleItems.length + index} />
            </motion.div>
          ))}
        </motion.div>
      ) : null}

      {hiddenItems.length > 0 ? (
        <div className="flex justify-center pt-1">
          <Button
            variant="outline"
            size="sm"
            className="transition-transform duration-[var(--duration-micro)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.97]"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "收起" : `展开更多（+${hiddenItems.length}）`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MetricValue({ value, suffix = "", maximumFractionDigits = 1 }: { value: number; suffix?: string; maximumFractionDigits?: number }) {
  const { formattedValue } = useCountUp(value, undefined, true, { maximumFractionDigits });
  return <span className="tabular-nums">{formattedValue}{suffix}</span>;
}

function PersonCard({ person, index }: { person: PersonStats; index: number }) {
  const isInsufficient = person.count < 10;

  const borderColor = isInsufficient
    ? "border-l-4 border-l-gray-300 bg-gray-50/50"
    : person.suggestion.label === "继续放量"
    ? "border-l-4 border-l-green-400 bg-green-50/50"
    : person.suggestion.label === "保持观察"
    ? "border-l-4 border-l-blue-400 bg-blue-50/50"
    : "border-l-4 border-l-orange-400 bg-orange-50/50";

  return (
    <MotionCard index={index} className={`space-y-3 p-4 ${borderColor}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">{person.name}</p>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${person.suggestion.color}`}>
            {person.suggestion.label}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isInsufficient && (
            <span className="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">数据不足</span>
          )}
          <span className="text-xs text-[var(--color-text-secondary)] tabular-nums">{person.count} 条数据</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <p className="text-xs text-[var(--color-text-secondary)]">爆款率</p>
          {person.count === 0 ? (
            <Badge variant="outline" className="text-slate-400">暂无数据</Badge>
          ) : (
            <Badge
              variant={person.hitRate >= 40 ? "default" : person.hitRate >= 20 ? "secondary" : "outline"}
              className={person.hitRate >= 40 ? "bg-green-500" : person.hitRate < 20 ? "border-red-300 text-red-500" : ""}
            >
              <MetricValue value={person.hitRate} suffix="%" />
            </Badge>
          )}
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-[var(--color-text-secondary)]">稳定性</p>
          <Badge
            variant={person.stability < 5 ? "default" : person.stability < 15 ? "secondary" : "outline"}
            className={person.stability < 5 ? "bg-green-500" : person.stability >= 15 ? "border-red-300 text-red-500" : ""}
          >
            {person.stability < 5 ? "稳定" : person.stability < 15 ? "一般" : "波动大"}
          </Badge>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-[var(--color-text-secondary)]">趋势</p>
          {person.count === 0 ? (
            <Badge variant="outline" className="text-slate-400">暂无数据</Badge>
          ) : (
            <Badge
              variant={person.trend > 10 ? "default" : person.trend < -10 ? "outline" : "secondary"}
              className={person.trend > 10 ? "bg-green-500" : person.trend < -10 ? "border-red-300 text-red-500" : ""}
            >
              <span className="tabular-nums">{person.trend > 0 ? "+" : ""}<MetricValue value={person.trend} suffix="%" /></span>
            </Badge>
          )}
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-[var(--color-text-secondary)]">互动效率</p>
          {person.totalPlay === 0 ? (
            <Badge variant="outline" className="text-slate-400">暂无数据</Badge>
          ) : (
            <Badge
              variant={person.engagementRate >= 5 ? "default" : person.engagementRate >= 2 ? "secondary" : "outline"}
              className={person.engagementRate >= 5 ? "bg-green-500" : person.engagementRate < 2 ? "border-red-300 text-red-500" : ""}
            >
              <MetricValue value={person.engagementRate} suffix="%" maximumFractionDigits={2} />
            </Badge>
          )}
        </div>
      </div>
    </MotionCard>
  );
}
