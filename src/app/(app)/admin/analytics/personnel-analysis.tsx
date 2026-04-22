"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Minus, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { containerVariants } from "@/lib/animations";
import { cn } from "@/lib/utils";

interface Report {
  id: string;
  submitter: string;
  report_date: string;
  play_count: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  published_at?: string | null;
  uploaded_at?: string;
}

interface PersonnelAnalysisProps {
  reports: Report[];
  title?: string;
  activePersonName?: string | null;
  onSelectPerson?: (name: string) => void;
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

function getSuggestion(metrics: { hitRate: number; stability: number; trend: number; engagementRate: number }) {
  if (metrics.trend < -10) {
    return { label: "重点关注", color: "text-rose-700", bgColor: "bg-rose-100/80", borderColor: "border-rose-200" };
  }
  if (metrics.hitRate >= 30 && metrics.trend >= 0) {
    return { label: "继续放量", color: "text-emerald-700", bgColor: "bg-emerald-100/80", borderColor: "border-emerald-200" };
  }
  if (metrics.stability >= 15) {
    return { label: "波动异常", color: "text-amber-700", bgColor: "bg-amber-100/80", borderColor: "border-amber-200" };
  }
  return { label: "保持观察", color: "text-blue-700", bgColor: "bg-blue-100/80", borderColor: "border-blue-200" };
}

function computeP70Map(reports: Report[]): Map<string, number> {
  const byDate = new Map<string, number[]>();

  for (const report of reports) {
    const current = byDate.get(report.report_date) ?? [];
    current.push(report.play_count ?? 0);
    byDate.set(report.report_date, current);
  }

  const result = new Map<string, number>();
  for (const [date, values] of byDate) {
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(sorted.length * 0.7) - 1);
    result.set(date, sorted[index]);
  }

  return result;
}

function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function formatPlayCountCompact(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return value.toLocaleString("zh-CN");
}

function formatSignedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function PersonnelAnalysis({
  reports,
  title = "人员深度分析",
  activePersonName = null,
  onSelectPerson,
}: PersonnelAnalysisProps) {
  const [sortBy, setSortBy] = useState<SortKey>("avgPlay");

  const stats = useMemo(() => {
    const p70Map = computeP70Map(reports);
    const byPerson = new Map<string, Report[]>();

    for (const report of reports) {
      const current = byPerson.get(report.submitter) ?? [];
      current.push(report);
      byPerson.set(report.submitter, current);
    }

    const today = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenAgo = sevenDaysAgo.toISOString().split("T")[0];
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenAgo = fourteenDaysAgo.toISOString().split("T")[0];

    const result: PersonStats[] = [];

    for (const [name, personReports] of byPerson) {
      const plays = personReports.map((report) => report.play_count ?? 0);
      const totalPlay = plays.reduce((sum, value) => sum + value, 0);
      const totalEngagement = personReports.reduce(
        (sum, report) => sum + (report.likes ?? 0) + (report.comments ?? 0) + (report.shares ?? 0) + (report.favorites ?? 0),
        0,
      );

      let hitCount = 0;
      for (const report of personReports) {
        const p70 = p70Map.get(report.report_date) ?? 0;
        if ((report.play_count ?? 0) > p70) hitCount += 1;
      }

      const hitRate = personReports.length > 0 ? (hitCount / personReports.length) * 100 : 0;
      const stability = stdDev(plays.map((play) => play / 10000));
      const recent = personReports.filter((report) => report.report_date >= sevenAgo && report.report_date <= today);
      const previous = personReports.filter((report) => report.report_date >= fourteenAgo && report.report_date < sevenAgo);
      const recentAvgPlay = recent.length > 0 ? recent.reduce((sum, report) => sum + (report.play_count ?? 0), 0) / recent.length : 0;
      const prevAvgPlay = previous.length > 0 ? previous.reduce((sum, report) => sum + (report.play_count ?? 0), 0) / previous.length : 0;
      const avgPlay = personReports.length > 0 ? totalPlay / personReports.length : 0;
      const trend = prevAvgPlay > 0 ? ((recentAvgPlay - prevAvgPlay) / prevAvgPlay) * 100 : 0;
      const engagementRate = totalPlay > 0 ? (totalEngagement / totalPlay) * 100 : 0;
      const suggestion = getSuggestion({ hitRate, stability, trend, engagementRate });

      result.push({
        name,
        count: personReports.length,
        hitRate,
        stability,
        trend,
        engagementRate,
        avgPlay,
        recentAvgPlay,
        prevAvgPlay,
        suggestion,
      });
    }

    return result;
  }, [reports]);

  const sorted = useMemo(() => {
    return [...stats].sort((left, right) => {
      if (sortBy === "hitRate") return right.hitRate - left.hitRate;
      if (sortBy === "stability") return left.stability - right.stability;
      if (sortBy === "trend") return right.trend - left.trend;
      if (sortBy === "avgPlay") return right.avgPlay - left.avgPlay;
      return right.engagementRate - left.engagementRate;
    });
  }, [sortBy, stats]);

  if (stats.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="暂无人员数据"
        description="成员提交数据后可查看各成员的爆款率、稳定性和成长趋势"
      />
    );
  }

  const maxHitRate = Math.max(...stats.map((stat) => stat.hitRate), 1);
  const maxAvgPlay = Math.max(...stats.map((stat) => Math.max(stat.recentAvgPlay, stat.prevAvgPlay, stat.avgPlay)), 1);
  const maxEngagement = Math.max(...stats.map((stat) => stat.engagementRate), 1);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">{title}</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">改为双列紧凑卡片后，桌面端能同时看到更多成员对比。</p>
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
                sortBy === key ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/50" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid gap-3 xl:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {sorted.map((person, index) => (
            <motion.div
              key={person.name}
              layout={!shouldReduceMotion}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.28, delay: shouldReduceMotion ? 0 : index * 0.03 }}
            >
              <PersonRankCard
                person={person}
                rank={index + 1}
                maxVals={{ maxHitRate, maxAvgPlay, maxEngagement }}
                isActive={activePersonName === person.name}
                onSelectPerson={onSelectPerson}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function PersonRankCard({
  person,
  rank,
  maxVals,
  isActive,
  onSelectPerson,
}: {
  person: PersonStats;
  rank: number;
  maxVals: { maxHitRate: number; maxAvgPlay: number; maxEngagement: number };
  isActive: boolean;
  onSelectPerson?: (name: string) => void;
}) {
  const isInsufficient = person.count < 10;
  const recentPlayWidth = person.recentAvgPlay > 0 ? Math.max(4, (person.recentAvgPlay / maxVals.maxAvgPlay) * 100) : 0;
  const prevPlayWidth = person.prevAvgPlay > 0 ? Math.max(4, (person.prevAvgPlay / maxVals.maxAvgPlay) * 100) : 0;
  const hitRateWidth = person.hitRate > 0 ? Math.max(4, (person.hitRate / maxVals.maxHitRate) * 100) : 0;
  const engagementWidth = person.engagementRate > 0 ? Math.max(4, (person.engagementRate / maxVals.maxEngagement) * 100) : 0;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[22px] border bg-white p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] lg:p-4",
        person.suggestion.borderColor,
        isActive && "ring-2 ring-blue-400/70 ring-offset-2 ring-offset-white",
      )}
    >
      <div className="pointer-events-none absolute -right-2 -top-5 text-[72px] font-black leading-none text-slate-50 transition-colors group-hover:text-blue-50/60">
        {rank}
      </div>

      <div className="relative z-10 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600 shadow-inner">
                {rank}
              </div>
              <div className="min-w-0">
                <h4 className="truncate text-[15px] font-bold text-slate-800">{person.name}</h4>
                <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                  {isInsufficient ? "样本不足 · " : ""}已收集 {person.count} 条视频
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("shrink-0 border-transparent", person.suggestion.bgColor, person.suggestion.color)}>
              {person.suggestion.label}
            </Badge>
            <TrendBadge trend={person.trend} />
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)]">
          <div className="rounded-2xl bg-slate-50/80 p-2.5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">均播对比</p>
                <p className="mt-1 text-[17px] font-bold text-slate-900">{formatPlayCountCompact(person.avgPlay)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium text-slate-400">稳定性</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">{person.stability.toFixed(1)}</p>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              <StackedBar
                label="本周 (近7天)"
                value={formatPlayCountCompact(person.recentAvgPlay)}
                width={recentPlayWidth}
                barClassName={person.trend >= 0 ? "bg-sky-500" : "bg-sky-400"}
                heightClassName="h-2"
              />
              <StackedBar
                label="上周 (8-14天前)"
                value={formatPlayCountCompact(person.prevAvgPlay)}
                width={prevPlayWidth}
                barClassName="bg-amber-400"
                heightClassName="h-1.5"
                muted
              />
            </div>
          </div>

          <div className="space-y-2">
            <MetricBarCard
              title="综合爆款率"
              value={`${person.hitRate.toFixed(1)}%`}
              width={hitRateWidth}
              barClassName="bg-[linear-gradient(90deg,var(--color-primary)_0%,var(--color-primary-light,var(--color-primary))_100%)]"
              toneClassName="bg-blue-50/80"
              description="蓝条改为纵向紧凑展示"
            />
            <MetricBarCard
              title="互动粘性"
              value={`${person.engagementRate.toFixed(2)}%`}
              width={engagementWidth}
              barClassName="bg-[linear-gradient(90deg,#fbbf24_0%,#f59e0b_100%)]"
              toneClassName="bg-amber-50/80"
              description="黄条堆叠在下方"
            />
          </div>
        </div>

        {onSelectPerson ? (
          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => onSelectPerson(person.name)}
              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              查看该成员样本
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: number }) {
  const icon =
    trend > 0 ? (
      <TrendingUp className="size-3.5 text-emerald-500" />
    ) : trend < 0 ? (
      <TrendingDown className="size-3.5 text-rose-500" />
    ) : (
      <Minus className="size-3.5 text-slate-400" />
    );

  return (
    <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {icon}
      <span>{formatSignedPercent(trend)}</span>
    </div>
  );
}

function StackedBar({
  label,
  value,
  width,
  barClassName,
  heightClassName,
  muted = false,
}: {
  label: string;
  value: string;
  width: number;
  barClassName: string;
  heightClassName: string;
  muted?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className={cn("flex items-center justify-between text-[11px] font-semibold", muted ? "text-slate-400" : "text-slate-500")}>
        <span>{label}</span>
        <span className={cn("text-slate-700", muted && "text-slate-500")}>{value}</span>
      </div>
      <div className={cn("w-full overflow-hidden rounded-full bg-white", heightClassName)}>
        <div className={cn("h-full rounded-full transition-all duration-1000", barClassName)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function MetricBarCard({
  title,
  value,
  width,
  barClassName,
  toneClassName,
  description,
}: {
  title: string;
  value: string;
  width: number;
  barClassName: string;
  toneClassName: string;
  description: string;
}) {
  return (
    <div className={cn("rounded-[18px] p-2.5", toneClassName)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
          <p className="mt-0.5 text-base font-bold text-slate-900">{value}</p>
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/90">
        <div className={cn("h-full rounded-full transition-all duration-1000", barClassName)} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">{description}</p>
    </div>
  );
}
