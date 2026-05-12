"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarCheck,
  FileText,
  MessageSquareWarning,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { ViolationsReviewTab, type ViolationsTabData } from "./tabs/violations-tab";
import { WeeklyDecisionView, type DecisionBucket } from "./weekly/view";
import { ConversionAnalyticsView, type AnalyticsRow, type TrendDay } from "./analytics/view";
import { AdviceTab } from "./tabs/advice-tab";
import { ScriptsTab, type ScriptsTabData } from "./tabs/scripts-tab";

export type HubTabKey = "scripts" | "violations" | "weekly" | "analytics" | "advice";

export interface HubShellProps {
  weekStart: string;
  activeTab: HubTabKey;
  violations: ViolationsTabData;
  weeklyBuckets: DecisionBucket[] | null;
  weeklyConfirmedAt: string | null;
  weeklyGeneratedBy: "ai" | "manual" | null;
  analyticsRows: AnalyticsRow[];
  analyticsTrend: TrendDay[];
  analyticsSort: "rate" | "usage" | "views";
  analyticsFormat: "all" | "oral" | "visual" | "mixed";
  scripts: ScriptsTabData;
}

type PipelineCounts = {
  scripts_total: number;
  violations_pending: number;
  weekly_queue: number;
  advice_pending: number;
};

const TABS: Array<{ key: HubTabKey; label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = [
  { key: "scripts", label: "话术", icon: FileText, description: "沉淀与 TOP10 转化话术" },
  { key: "violations", label: "违规", icon: MessageSquareWarning, description: "复核风险案例，落结论与建议动作" },
  { key: "weekly", label: "每周筛选", icon: CalendarCheck, description: "推广 / 测试 / 废弃 / 封禁 四类清单" },
  { key: "analytics", label: "数据分析", icon: TrendingUp, description: "TOP20 排行榜 + 7 日违规趋势" },
  { key: "advice", label: "建议动作", icon: ShieldCheck, description: "把复核结论落成下一步动作" },
];

function usePipelineCounts(weekStart: string) {
  const [data, setData] = useState<PipelineCounts | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/conversion-hub/pipeline-counts?week_start=${weekStart}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = (await res.json()) as PipelineCounts;
        if (active) setData(json);
      } catch {}
    };
    void load();
    const id = setInterval(load, 45_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [weekStart]);
  return data;
}

function StatusStrip({ weekStart, counts }: { weekStart: string; counts: PipelineCounts | null }) {
  const items = [
    { label: "转化话术", value: counts?.scripts_total ?? 0, tone: "neutral" as const },
    { label: "待复核违规", value: counts?.violations_pending ?? 0, tone: "danger" as const },
    { label: "本周筛选池", value: counts?.weekly_queue ?? 0, tone: "warning" as const },
    { label: "待落动作", value: counts?.advice_pending ?? 0, tone: "neutral" as const },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-y border-zinc-100 py-3 md:grid-cols-4">
      {items.map((item) => {
        const toneClass = {
          neutral: "text-zinc-800",
          warning: item.value > 0 ? "text-[#D99E55]" : "text-zinc-800",
          danger: item.value > 0 ? "text-[#C9604D]" : "text-zinc-800",
        }[item.tone];
        return (
          <div key={item.label} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
              {item.label}
            </span>
            <span className={cn("mt-1 text-[22px] font-semibold tracking-tight font-mono tabular-nums", toneClass)}>
              {item.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TabNav({ active }: { active: HubTabKey }) {
  const searchParams = useSearchParams();
  const buildHref = useCallback(
    (tab: HubTabKey) => {
      const params = new URLSearchParams();
      params.set("tab", tab);
      const preserved = ["q", "status", "category", "sort", "format"];
      if (active === tab) {
        for (const key of preserved) {
          const val = searchParams.get(key);
          if (val) params.set(key, val);
        }
      }
      return `/admin/conversion-hub?${params.toString()}`;
    },
    [active, searchParams],
  );

  return (
    <nav className="flex flex-wrap gap-6 border-b border-zinc-200" aria-label="转化中心分区">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            href={buildHref(tab.key)}
            className={cn(
              "group -mb-px flex items-center gap-1.5 border-b-2 px-1 pb-2 pt-1 text-[13px] font-medium tracking-tight transition-[color,border-color] duration-150",
              isActive
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="size-3.5 stroke-[1.5]" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function TabSubheader({ tab }: { tab: HubTabKey }) {
  const info = TABS.find((t) => t.key === tab);
  if (!info) return null;
  return (
    <p className="text-[13px] leading-[1.7] text-zinc-500">
      {info.description}
    </p>
  );
}

function formatWeekRange(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) => `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  return `${fmt(start)} - ${fmt(end)}`;
}

export function ConversionHubShell(props: HubShellProps) {
  const router = useRouter();
  const counts = usePipelineCounts(props.weekStart);
  const tab = props.activeTab;

  const mergedCounts = useMemo<PipelineCounts>(() => {
    if (counts) return counts;
    return {
      scripts_total: props.scripts.topScripts.length,
      violations_pending: props.violations.pendingCount,
      weekly_queue: 0,
      advice_pending: 0,
    };
  }, [counts, props.scripts.topScripts.length, props.violations.pendingCount]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
            Conversion Hub
          </p>
          <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-800">
            转化中心
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] leading-[1.7] text-zinc-500">
            <Sparkles className="size-3.5 stroke-[1.5]" />
            话术 → 违规 → 筛选 → 分析 → 动作，五步都在这里
          </p>
        </div>
        <div className="text-[12px] font-medium text-zinc-500">
          本周 · {formatWeekRange(props.weekStart)}
        </div>
      </div>

      <StatusStrip weekStart={props.weekStart} counts={mergedCounts} />

      <TabNav active={tab} />
      <TabSubheader tab={tab} />

      <div>
        {tab === "scripts" && <ScriptsTab data={props.scripts} />}
        {tab === "violations" && <ViolationsReviewTab data={props.violations} />}
        {tab === "weekly" && (
          <WeeklyDecisionView
            weekStart={props.weekStart}
            buckets={props.weeklyBuckets}
            confirmedAt={props.weeklyConfirmedAt}
            generatedBy={props.weeklyGeneratedBy}
          />
        )}
        {tab === "analytics" && (
          <ConversionAnalyticsView
            rows={props.analyticsRows}
            trend={props.analyticsTrend}
            sort={props.analyticsSort}
            format={props.analyticsFormat}
          />
        )}
        {tab === "advice" && <AdviceTab />}
      </div>

      {tab !== "violations" && mergedCounts.violations_pending > 0 && (
        <button
          type="button"
          onClick={() => router.push("/admin/conversion-hub?tab=violations&status=submitted")}
          className="flex w-full items-center justify-between gap-3 border-l-2 border-[#C9604D] bg-[#C9604D]/5 px-5 py-3 text-left transition-[background-color] duration-150 hover:bg-[#C9604D]/10"
        >
          <div className="flex items-center gap-3">
            <MessageSquareWarning className="size-4 stroke-[1.5] text-[#C9604D]" />
            <p className="text-[13px] tracking-tight text-zinc-700">
              有 <span className="font-semibold text-[#C9604D]">{mergedCounts.violations_pending}</span> 条违规案例待复核
            </p>
          </div>
          <ArrowRight className="size-4 stroke-[1.5] text-zinc-400" />
        </button>
      )}
    </div>
  );
}
