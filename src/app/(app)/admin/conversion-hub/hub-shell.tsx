"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarCheck,
  FileText,
  MessageSquareWarning,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
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
  violations: ViolationsTabData | null;
  pendingViolationsCount: number;
  weeklyBuckets: DecisionBucket[] | null;
  weeklyConfirmedAt: string | null;
  weeklyGeneratedBy: "ai" | "manual" | null;
  analyticsRows: AnalyticsRow[];
  analyticsTrend: TrendDay[];
  analyticsSort: "rate" | "usage" | "views";
  analyticsFormat: "all" | "oral" | "visual" | "mixed";
  scripts: ScriptsTabData | null;
}

const TABS: Array<{ key: HubTabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "scripts", label: "话术", icon: FileText },
  { key: "violations", label: "违规", icon: MessageSquareWarning },
  { key: "weekly", label: "周报", icon: CalendarCheck },
  { key: "analytics", label: "分析", icon: TrendingUp },
  { key: "advice", label: "建议", icon: ShieldCheck },
];

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
                ? "border-[#D97757] text-zinc-800"
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

function formatWeekRange(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) => `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  return `${fmt(start)} - ${fmt(end)}`;
}

export function ConversionHubShell(props: HubShellProps) {
  const router = useRouter();
  const tab = props.activeTab;

  const weekRange = useMemo(() => formatWeekRange(props.weekStart), [props.weekStart]);
  const pendingViolationsCount = tab === "violations" ? (props.violations?.pendingCount ?? 0) : props.pendingViolationsCount;
  const hasPendingViolations = pendingViolationsCount > 0 && tab !== "violations";

  return (
    <AdminWorkspaceLayout
      eyebrow="Conversion Hub"
      title="转化中心"
      description="话术 → 违规 → 周报 → 分析 → 建议，五步都在这里"
      indexItems={[]}
      actions={
        <span className="text-[12px] text-zinc-500">
          本周 · {weekRange}
        </span>
      }
    >
      <section className="space-y-4">
        <TabNav active={tab} />

        <div>
          {tab === "scripts" && props.scripts ? <ScriptsTab data={props.scripts} /> : null}
          {tab === "violations" && props.violations ? <ViolationsReviewTab data={props.violations} /> : null}
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

        {hasPendingViolations && (
          <button
            type="button"
            onClick={() => router.push("/admin/conversion-hub?tab=violations&status=submitted")}
            className="flex w-full items-center justify-between gap-2 border-l-2 border-[#C9604D] bg-[#C9604D]/5 px-4 py-2 text-left transition-[background-color] duration-150 hover:bg-[#C9604D]/10"
          >
            <div className="flex items-center gap-2">
              <MessageSquareWarning className="size-4 stroke-[1.5] text-[#C9604D]" />
              <p className="text-[13px] tracking-tight text-zinc-700">
                有 <span className="font-semibold text-[#C9604D]">{pendingViolationsCount}</span> 条违规案例待复核
              </p>
            </div>
            <ArrowRight className="size-4 stroke-[1.5] text-zinc-400" />
          </button>
        )}
      </section>
    </AdminWorkspaceLayout>
  );
}
