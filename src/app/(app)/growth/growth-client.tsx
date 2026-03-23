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
}: GrowthClientShellProps) {
  const hasEnoughData = reportCount >= 3;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">成长分析</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {profileName} · {accountCount} 个账号 · 近30天 {reportCount} 条数据
        </p>
      </div>

      {!hasEnoughData ? (
        <EmptyState
          icon={BarChart2}
          title="连续提交 3 天后解锁分析"
          description={`当前已有 ${reportCount} 条数据，再提交 ${3 - reportCount} 天即可解锁成长分析`}
          className="py-16"
        />
      ) : (
        <>
          <StatusCardGrid items={statusCards} />
          <六维雷达面板 capabilityCards={capabilityCards} weakBenchmarkCards={weakBenchmarkCards} />
          {pkPanel ? <GrowthPkPanel leftName={pkPanel.leftName} rightName={pkPanel.rightName} rows={pkPanel.rows} /> : null}
          <DiagnosisCard myReports={myReports} teamReports={teamReports} />
          <ScriptBreakdown title="文案拆解" data={scriptBreakdown} />
          <GrowthInsightPanel />
          <AdvicePanel data={advice} noData={myReports.length === 0} />
        </>
      )}
    </div>
  );
}
