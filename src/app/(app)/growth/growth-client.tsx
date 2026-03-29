"use client";

import { BarChart2 } from "lucide-react";
import { 六维雷达面板 } from "@/components/growth/六维雷达面板";
import { DiagnosisCard } from "@/components/growth/diagnosis-card";
import { StatusCardGrid } from "@/components/growth/status-card-grid";
import { ScriptBreakdown } from "@/components/growth/script-breakdown";
import { AdvicePanel } from "@/components/growth/advice-panel";
import { GrowthInsightPanel } from "@/components/growth/growth-insight-panel";
import { GrowthPkPanel } from "@/components/growth/growth-pk-panel";
import { EmptyState } from "@/components/ui/empty-state";
import type { AdviceSections, GrowthDimensionCard, GrowthPkRow, ScriptBreakdownData, StatusCardItem, WeakBenchmarkCard } from "@/lib/growth-page";
import type { MetricsReport } from "@/lib/metrics";

interface TeamMember {
  id: string;
  name: string;
  scores: number[];
}

interface GrowthClientShellProps {
  profileName: string;
  accountCount: number;
  reportCount: number;
  statusCards: StatusCardItem[];
  capabilityCards: GrowthDimensionCard[];
  weakBenchmarkCards: WeakBenchmarkCard[];
  pkPanel: { leftName: string; rightName: string; rows: GrowthPkRow[] } | null;
  scriptBreakdown: ScriptBreakdownData;
  advice: AdviceSections;
  myReports: MetricsReport[];
  teamReports: MetricsReport[];
  teamMembers?: TeamMember[];
}

export function GrowthClientShell({
  profileName,
  accountCount,
  reportCount,
  statusCards,
  capabilityCards,
  weakBenchmarkCards,
  pkPanel,
  scriptBreakdown,
  advice,
  myReports,
  teamReports,
  teamMembers = [],
}: GrowthClientShellProps) {
  const hasEnoughData = reportCount >= 3;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-3 sm:px-6 lg:px-8">
      <div className="space-y-7">
        <section className="rounded-[30px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(244,248,255,0.86))] p-5 shadow-[var(--shadow-card)] backdrop-blur-[20px] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Growth Analysis</p>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[30px]">成长分析总览</h1>
                <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
                  先看能力分布与诊断结论，再决定优先优化哪一段内容结构，避免在细节里反复试错。
                </p>
              </div>
            </div>
            <div className="grid gap-2 rounded-2xl border border-white/80 bg-white/85 p-3 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)] sm:min-w-[280px]">
              <div className="font-medium text-[var(--color-text-primary)]">当前样本</div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{profileName} · {accountCount} 个账号 · 近30天 {reportCount} 条数据</p>
              <p>{hasEnoughData ? "已满足成长分析最小样本要求" : `再提交 ${3 - reportCount} 天即可解锁完整分析`}</p>
            </div>
          </div>
        </section>

        {!hasEnoughData ? (
          <EmptyState
            icon={BarChart2}
            title="连续提交 3 天后解锁分析"
            description={`当前已有 ${reportCount} 条数据，再提交 ${3 - reportCount} 天即可解锁成长分析`}
            className="py-16"
          />
        ) : (
          <div className="space-y-5">
            <StatusCardGrid items={statusCards} />
            <六维雷达面板 capabilityCards={capabilityCards} weakBenchmarkCards={weakBenchmarkCards} teamMembers={teamMembers} />
            {pkPanel ? <GrowthPkPanel leftName={pkPanel.leftName} rightName={pkPanel.rightName} rows={pkPanel.rows} /> : null}
            <DiagnosisCard myReports={myReports} teamReports={teamReports} />
            <ScriptBreakdown title="文案拆解" data={scriptBreakdown} />
            <GrowthInsightPanel />
            <AdvicePanel data={advice} noData={myReports.length === 0} />
          </div>
        )}
      </div>
    </div>
  );
}
