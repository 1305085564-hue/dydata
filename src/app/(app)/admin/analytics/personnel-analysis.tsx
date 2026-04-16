"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MotionCard } from "@/components/ui/motion-card";
import { EmptyState } from "@/components/ui/empty-state";
import { containerVariants, itemVariants } from "@/lib/animations";
import { cn } from "@/lib/utils";

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

type SortKey = "hitRate" | "stability" | "trend" | "engagementRate" | "avgPlay";

interface PersonStats {
  name: string;
  count: number;
  hitRate: number;
  stability: number;
  trend: number;
  engagementRate: number;
  avgPlay: number;
  recentAvgPlay: number;
  prevAvgPlay: number;
  suggestion: { label: string; color: string; bgColor: string; borderColor: string };
}

function getSuggestion(p: { hitRate: number; stability: number; trend: number; engagementRate: number }) {
  if (p.trend < -10) return { label: "重点关注", color: "text-rose-700", bgColor: "bg-rose-100/80", borderColor: "border-rose-200" };
  if (p.hitRate >= 30 && p.trend >= 0) return { label: "继续放量", color: "text-emerald-700", bgColor: "bg-emerald-100/80", borderColor: "border-emerald-200" };
  if (p.stability >= 15) return { label: "波动异常", color: "text-amber-700", bgColor: "bg-amber-100/80", borderColor: "border-amber-200" };
  return { label: "保持观察", color: "text-blue-700", bgColor: "bg-blue-100/80", borderColor: "border-blue-200" };
}

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

function formatPlayCountCompact(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return value.toLocaleString("zh-CN");
}

export function PersonnelAnalysis({ reports, title = "人员深度分析" }: PersonnelAnalysisProps) {
  const [sortBy, setSortBy] = useState<SortKey>("avgPlay");

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
      const avgPlay = totalPlay / personReports.length;
      
      const trend = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;
      const engagementRate = totalPlay > 0 ? (totalEng / totalPlay) * 100 : 0;
      
      const suggestion = getSuggestion({ hitRate, stability, trend, engagementRate });
      
      result.push({ 
        name, 
        count: personReports.length, 
        hitRate, 
        stability, 
        trend, 
        engagementRate, 
        avgPlay,
        recentAvgPlay: recentAvg,
        prevAvgPlay: prevAvg,
        suggestion 
      });
    }

    return result;
  }, [reports]);

  const sorted = useMemo(() => {
    return [...stats].sort((a, b) => {
      if (sortBy === "hitRate") return b.hitRate - a.hitRate;
      if (sortBy === "stability") return a.stability - b.stability;
      if (sortBy === "trend") return b.trend - a.trend;
      if (sortBy === "avgPlay") return b.avgPlay - a.avgPlay;
      return b.engagementRate - a.engagementRate;
    });
  }, [stats, sortBy]);

  if (stats.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="暂无人员数据"
        description="成员提交数据后可查看各成员的爆款率、稳定性和成长趋势"
      />
    );
  }

  // Find max values for relative bars
  const maxHitRate = Math.max(...stats.map(s => s.hitRate));
  const maxAvgPlay = Math.max(...stats.map(s => Math.max(s.recentAvgPlay, s.prevAvgPlay, s.avgPlay)));
  const maxEngagement = Math.max(...stats.map(s => s.engagementRate));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">{title}</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">可视化对比团队表现，快速发现本周异动人员。</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-slate-200/60 bg-slate-50/50 p-1">
          {([
            ["avgPlay", "均播表现"],
            ["hitRate", "爆款能力"],
            ["trend", "近期趋势"],
            ["engagementRate", "粉丝粘性"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                sortBy === key 
                  ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/50" 
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
        {/* Table Header */}
        <div className="hidden grid-cols-12 gap-4 px-6 text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:grid">
          <div className="col-span-3">人员标签</div>
          <div className="col-span-4">本周均播 vs 上周均播</div>
          <div className="col-span-2">综合爆款率</div>
          <div className="col-span-3">互动粘性</div>
        </div>

        <AnimatePresence mode="popLayout">
          {sorted.map((person, index) => (
            <motion.div 
              key={person.name} 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <PersonRankRow 
                person={person} 
                rank={index + 1} 
                maxVals={{ maxHitRate, maxAvgPlay, maxEngagement }} 
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function PersonRankRow({ 
  person, 
  rank, 
  maxVals 
}: { 
  person: PersonStats; 
  rank: number;
  maxVals: { maxHitRate: number, maxAvgPlay: number, maxEngagement: number }
}) {
  const isInsufficient = person.count < 10;
  
  // Calculate bar widths (percentage)
  const recentPlayWidth = person.recentAvgPlay > 0 ? Math.max(2, (person.recentAvgPlay / maxVals.maxAvgPlay) * 100) : 0;
  const prevPlayWidth = person.prevAvgPlay > 0 ? Math.max(2, (person.prevAvgPlay / maxVals.maxAvgPlay) * 100) : 0;
  const hitRateWidth = person.hitRate > 0 ? Math.max(2, (person.hitRate / maxVals.maxHitRate) * 100) : 0;
  const engWidth = person.engagementRate > 0 ? Math.max(2, (person.engagementRate / maxVals.maxEngagement) * 100) : 0;

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-[20px] border bg-white p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-0.5",
      person.suggestion.borderColor
    )}>
      {/* Absolute Ranking Number background */}
      <div className="absolute -left-3 -top-6 text-[80px] font-black leading-none text-slate-50 opacity-50 select-none pointer-events-none group-hover:text-blue-50/50 transition-colors">
        {rank}
      </div>

      <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
        {/* User Info (col 3) */}
        <div className="flex items-center gap-4 lg:col-span-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-600 shadow-inner">
            {rank}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="truncate text-base font-bold text-slate-800">{person.name}</h4>
              <Badge variant="outline" className={cn("shrink-0 border-transparent", person.suggestion.bgColor, person.suggestion.color)}>
                {person.suggestion.label}
              </Badge>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">
              {isInsufficient ? "样本不足 · " : ""}已收集 {person.count} 条视频
            </p>
          </div>
        </div>

        {/* Avg Play Comparison (col 4) */}
        <div className="lg:col-span-4 space-y-3 lg:border-l lg:border-slate-100 lg:pl-6">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-semibold text-slate-500">
              <span>本周 (近7天)</span>
              <span className="text-slate-800">{formatPlayCountCompact(person.recentAvgPlay)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div 
                className={cn("h-full rounded-full transition-all duration-1000", person.trend >= 0 ? "bg-emerald-400" : "bg-rose-400")} 
                style={{ width: `${recentPlayWidth}%` }} 
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-semibold text-slate-400">
              <span>上周 (8-14天前)</span>
              <span className="text-slate-600">{formatPlayCountCompact(person.prevAvgPlay)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div 
                className="h-full rounded-full bg-slate-300 transition-all duration-1000" 
                style={{ width: `${prevPlayWidth}%` }} 
              />
            </div>
          </div>
        </div>

        {/* Hit Rate (col 2) */}
        <div className="lg:col-span-2 space-y-2 lg:border-l lg:border-slate-100 lg:pl-6">
          <div className="flex justify-between lg:hidden text-[11px] font-semibold text-slate-500">
            <span>综合爆款率</span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-800">
              {person.hitRate.toFixed(1)}<span className="text-sm font-semibold text-slate-400">%</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div 
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-primary)_0%,#60a5fa_100%)] transition-all duration-1000" 
              style={{ width: `${hitRateWidth}%` }} 
            />
          </div>
        </div>

        {/* Engagement (col 3) */}
        <div className="lg:col-span-3 space-y-2 lg:border-l lg:border-slate-100 lg:pl-6">
          <div className="flex justify-between lg:hidden text-[11px] font-semibold text-slate-500">
            <span>互动粘性 (点赞评转/播放)</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-lg font-bold text-slate-700">{person.engagementRate.toFixed(2)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div 
                  className="h-full rounded-full bg-amber-400 transition-all duration-1000" 
                  style={{ width: `${engWidth}%` }} 
                />
              </div>
            </div>
            <div className="shrink-0 flex items-center justify-center size-8 rounded-full bg-slate-50 text-slate-400">
               {person.trend > 0 ? <TrendingUp className="size-4 text-emerald-500" /> : person.trend < 0 ? <TrendingDown className="size-4 text-rose-500" /> : <Minus className="size-4 text-slate-400" />}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
