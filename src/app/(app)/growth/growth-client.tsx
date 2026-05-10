"use client";

import { Sparkles, Target } from "lucide-react";
import { 六维雷达面板 } from "@/components/growth/六维雷达面板";
import { DiagnosisCard } from "@/components/growth/diagnosis-card";
import { StatusCardGrid } from "@/components/growth/status-card-grid";
import { ScriptBreakdown } from "@/components/growth/script-breakdown";
import { GrowthActionPlanPanel } from "@/components/growth/growth-action-plan-panel";
import { GrowthPkPanel } from "@/components/growth/growth-pk-panel";
import { AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";

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
  summary: {
    hasEnoughData: boolean;
    weakestDimension: string | null;
  };
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
  summary,
}: GrowthClientShellProps) {
  return (
    <AppShell width="wide" className="pb-12">
      {/* 顶层数据仪 — 合并 Hero + Performance Snapshot */}
      <AppShellHero
        title="成长分析总览"
        description="先看能力分布和诊断结论，再决定优先优化哪一段内容结构，避免在细节里反复试错。"
        meta={
          <div className="flex flex-col items-end gap-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] text-zinc-500">
              <Sparkles className="size-3.5 stroke-[1.5]" />
              {reportCount >= 3 ? "已满足最小样本要求" : reportCount > 0 ? "虚拟数据预览中，再提交真实数据替换" : "虚拟数据预览中，提交数据后替换"}
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-zinc-500">
              <span>分析主体 · {profileName || "当前账号"}</span>
              <span className="text-zinc-300">·</span>
              <span>{accountCount} 个账号</span>
              <span className="text-zinc-300">·</span>
              <span>{reportCount} 条样本</span>
              <span className="text-zinc-300">·</span>
              <span>最弱 {summary.weakestDimension ?? "待积累"}</span>
            </div>
          </div>
        }
      >
        <StatusCardGrid items={statusCards} />
      </AppShellHero>

      {/* 左右分栏：能力档案 + 诊断任务 */}
      <div className="grid gap-5 lg:grid-cols-[minmax(360px,0.4fr)_minmax(0,1fr)]">
        {/* 左栏：六维雷达 */}
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[20px] font-semibold tracking-tight text-zinc-800">能力分布</h2>
              <p className="mt-1 text-[13px] leading-[1.7] text-zinc-500">看清六维差距来自哪里。</p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] text-zinc-500">
              <Target className="size-3.5 stroke-[1.5] text-[#D99E55]" />
              最弱：{summary.weakestDimension ?? "待积累"}
            </div>
          </div>
          <六维雷达面板 capabilityCards={capabilityCards} weakBenchmarkCards={weakBenchmarkCards} teamMembers={teamMembers} />
        </section>

        {/* 右栏：诊断建议 */}
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="text-[20px] font-semibold tracking-tight text-zinc-800">诊断与行动</h2>
            <p className="mt-1 text-[13px] leading-[1.7] text-zinc-500">结合团队均值，先明确当前最该动的地方。</p>
          </div>
          <DiagnosisCard myReports={myReports} teamReports={teamReports} />
        </section>
      </div>

      {/* Peer Battle */}
      {pkPanel ? (
        <AppShellSection title="同标签对比" description="和最接近你的对手对比，优先找能直接复制的差距。">
          <GrowthPkPanel leftName={pkPanel.leftName} rightName={pkPanel.rightName} rows={pkPanel.rows} />
        </AppShellSection>
      ) : null}

      {/* 底部双栏：文案拆解 + AI洞察 */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <AppShellSection title="文案拆解" description="先定位问题发生在开头、中段还是结尾。">
          <ScriptBreakdown title="文案拆解" data={scriptBreakdown} />
        </AppShellSection>

        <AppShellSection title="AI 洞察与行动建议" description="把结论、证据、示例和动作收成一套。">
          <GrowthActionPlanPanel advice={advice} noData={myReports.length === 0} />
        </AppShellSection>
      </div>
    </AppShell>
  );
}
