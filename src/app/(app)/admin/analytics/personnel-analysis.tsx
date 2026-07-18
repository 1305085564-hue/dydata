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
  suggestion: { label: string; color: string; bgColor: string; leftBorder: string };
}

function getSuggestion(metrics: { hitRate: number; stability: number; trend: number; engagementRate: number }) {
  if (metrics.trend < -10) {
    return { label: "重点关注", color: "text-[#B24E3E]", bgColor: "bg-[#C9604D]/10", leftBorder: "border-l-[#C9604D]" };
  }
  if (metrics.hitRate >= 30 && metrics.trend >= 0) {
    return { label: "继续放量", color: "text-[#3F7A4E]", bgColor: "bg-[#6FAA7D]/10", leftBorder: "border-l-[#6FAA7D]" };
  }
  if (metrics.stability >= 15) {
    return { label: "波动异常", color: "text-[#8F641B]", bgColor: "bg-[#D99E55]/10", leftBorder: "border-l-[#D99E55]" };
  }
  return { label: "保持观察", color: "text-stone-700", bgColor: "bg-stone-100", leftBorder: "border-l-transparent" };
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
  const shouldReduceMotion = useReducedMotion();

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h3 className="text-[18px] font-medium tracking-tight text-stone-900">{title}</h3>
          <p className="text-[13px] text-stone-500">改为双列紧凑卡片后，桌面端能同时看到更多成员对比。</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 p-1">
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
                "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                sortBy === key ? "bg-white text-stone-900" : "text-stone-500 hover:text-stone-700",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
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
 "group relative overflow-hidden rounded-xl bg-stone-50 p-3 transition-[background-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-white active:translate-y-0",
        isActive && "ring-1 ring-[#D97757]/30",
      )}
    >
      <div className="relative z-10 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[12px] font-medium text-stone-700">
                {rank}
              </div>
              <div className="min-w-0">
                <h4 className="truncate text-[13px] font-medium text-stone-900">{person.name}</h4>
                <p className="mt-0.5 text-[12px] text-stone-500">
                  {isInsufficient ? "样本不足 · " : ""}已收集 {person.count} 条视频
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Badge variant="outline" className={cn("h-6 shrink-0 border-transparent px-2 text-[12px]", person.suggestion.bgColor, person.suggestion.color)}>
              {person.suggestion.label}
            </Badge>
            <TrendBadge trend={person.trend} />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="rounded-lg bg-stone-50 p-2">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[12px] tracking-[0.12em] text-stone-500">均播对比</p>
                <p className="mt-0.5 text-[18px] font-medium text-stone-900 tabular-nums tracking-tight">{formatPlayCountCompact(person.avgPlay)}</p>
              </div>
              <div className="text-right">
                <p className="text-[12px] text-stone-500">稳定性</p>
                <p className="mt-0.5 text-[12px] font-medium text-stone-700 tabular-nums">{person.stability.toFixed(1)}</p>
              </div>
            </div>

            <div className="mt-2 space-y-2">
              <StackedBar
                label="本周 (近7天)"
                value={formatPlayCountCompact(person.recentAvgPlay)}
                width={recentPlayWidth}
                barClassName={person.trend >= 0 ? "bg-[#6FAA7D]" : "bg-[#C9604D]"}
                heightClassName="h-2"
              />
              <StackedBar
                label="上周 (8-14天前)"
                value={formatPlayCountCompact(person.prevAvgPlay)}
                width={prevPlayWidth}
                barClassName="bg-[#D99E55]"
                heightClassName="h-1.5"
                muted
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <MetricBarCard
              title="综合爆款率"
              value={`${person.hitRate.toFixed(1)}%`}
              width={hitRateWidth}
              barClassName="bg-[#D97757]"
              toneClassName="bg-stone-50"
              description="蓝条改为纵向紧凑展示"
            />
            <MetricBarCard
              title="互动粘性"
              value={`${person.engagementRate.toFixed(2)}%`}
              width={engagementWidth}
              barClassName="bg-[#D99E55]"
              toneClassName="bg-stone-50"
              description="黄条堆叠在下方"
            />
          </div>
        </div>

        {onSelectPerson ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => onSelectPerson(person.name)}
              className="inline-flex items-center rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 text-[12px] font-medium text-stone-700 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-stone-100"
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
      <TrendingUp className="size-3.5 stroke-[1.5] text-[#3F7A4E]" />
    ) : trend < 0 ? (
      <TrendingDown className="size-3.5 stroke-[1.5] text-[#B24E3E]" />
    ) : (
      <Minus className="size-3.5 stroke-[1.5] text-stone-500" />
    );

  return (
    <div className="flex h-6 items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[12px] font-medium text-stone-700">
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
    <div className="space-y-1">
      <div className={cn("flex items-center justify-between gap-2 text-[12px] font-normal", muted ? "text-stone-500/60" : "text-stone-500")}>
        <span>{label}</span>
        <span className="text-stone-700 tabular-nums">{value}</span>
      </div>
      <div className={cn("w-full overflow-hidden rounded-full bg-white", heightClassName)}>
        <div className={cn("h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]", barClassName)} style={{ width: `${width}%` }} />
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
    <div className={cn("rounded-xl p-2", toneClassName)}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[12px] tracking-[0.12em] text-stone-500">{title}</p>
          <p className="mt-0.5 text-[13px] font-medium text-stone-700 tabular-nums">{value}</p>
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/90">
        <div className={cn("h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]", barClassName)} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1 line-clamp-1 text-[12px] leading-4 text-stone-500">{description}</p>
    </div>
  );
}
