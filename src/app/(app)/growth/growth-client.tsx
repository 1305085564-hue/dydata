"use client";

import { Sparkles, Target } from "lucide-react";
import { 六维雷达面板 } from "@/components/growth/六维雷达面板";
import { DiagnosisCard } from "@/components/growth/diagnosis-card";
import { StatusCardGrid } from "@/components/growth/status-card-grid";
import { ScriptBreakdown } from "@/components/growth/script-breakdown";
import { GrowthActionPlanPanel } from "@/components/growth/growth-action-plan-panel";
import { GrowthPkPanel } from "@/components/growth/growth-pk-panel";
import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";

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
          <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs sm:text-sm text-zinc-950">
            <Sparkles className="size-3.5" />
            {reportCount >= 3 ? "已满足最小样本要求" : reportCount > 0 ? "虚拟数据预览中，再提交真实数据替换" : "虚拟数据预览中，提交数据后替换"}
          </div>
        }
      >
        <AppShellMetricStrip
          columns={4}
          items={[
            {
              label: "分析主体",
              value: profileName || "当前账号",
              hint: "当前成长视角",
              tone: "primary",
            },
            {
              label: "账号数量",
              value: `${accountCount} 个`,
              hint: "参与分析的账号",
              tone: "neutral",
            },
            {
              label: "近 30 天样本",
              value: `${reportCount} 条`,
              hint: reportCount >= 3 ? "可生成完整分析" : "含虚拟数据预览",
              tone: reportCount >= 3 ? "success" : "warning",
            },
            {
              label: "当前最弱项",
              value: summary.weakestDimension ?? "待积累",
              hint: "优先优化这个维度",
              tone: summary.weakestDimension ? "warning" : "neutral",
            },
          ]}
        />
        <div className="pt-2">
          <StatusCardGrid items={statusCards} />
        </div>
      </AppShellHero>

      {/* 左右分栏：能力档案 + 诊断任务 */}
      <div className="grid gap-6 lg:grid-cols-[minmax(360px,0.4fr)_minmax(0,1fr)]">
        {/* 左栏：六维雷达 */}
        <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-zinc-950">能力分布</h2>
              <p className="mt-1 text-sm text-zinc-500">看清六维差距来自哪里。</p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-500">
              <Target className="size-3.5 text-[#EAB308]" />
              最弱：{summary.weakestDimension ?? "待积累"}
            </div>
          </div>
          <六维雷达面板 capabilityCards={capabilityCards} weakBenchmarkCards={weakBenchmarkCards} teamMembers={teamMembers} />
        </section>

        {/* 右栏：诊断建议 */}
        <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold tracking-tight text-zinc-950">诊断与行动</h2>
            <p className="mt-1 text-sm text-zinc-500">结合团队均值，先明确当前最该动的地方。</p>
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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
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
