"use client";

import { CapabilityGrid } from "@/components/growth/capability-grid";
import { StatusCardGrid } from "@/components/growth/status-card-grid";
import { WeaknessBenchmarkGrid } from "@/components/growth/weakness-benchmark-grid";
import { ScriptBreakdown } from "@/components/growth/script-breakdown";
import { AdvicePanel } from "@/components/growth/advice-panel";
import { GrowthPkPanel } from "@/components/growth/growth-pk-panel";
import type { AdviceSections, GrowthDimensionCard, GrowthPkRow, ScriptBreakdownData, StatusCardItem, WeakBenchmarkCard } from "@/lib/growth-page";

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
}: GrowthClientShellProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">成长分析</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {profileName} · {accountCount} 个账号 · 近30天 {reportCount} 条数据
        </p>
      </div>

      <StatusCardGrid items={statusCards} />
      <CapabilityGrid items={capabilityCards} />
      <WeaknessBenchmarkGrid items={weakBenchmarkCards} />
      {pkPanel ? <GrowthPkPanel leftName={pkPanel.leftName} rightName={pkPanel.rightName} rows={pkPanel.rows} /> : null}
      <ScriptBreakdown title="文案拆解" data={scriptBreakdown} />
      <AdvicePanel data={advice} />
    </div>
  );
}
