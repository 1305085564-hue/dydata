"use client";

import { BarChart2, Sparkles, Target, TrendingUp } from "lucide-react";
import { 六维雷达面板 } from "@/components/growth/六维雷达面板";
import { DiagnosisCard } from "@/components/growth/diagnosis-card";
import { StatusCardGrid } from "@/components/growth/status-card-grid";
import { ScriptBreakdown } from "@/components/growth/script-breakdown";
import { GrowthActionPlanPanel } from "@/components/growth/growth-action-plan-panel";
import { GrowthPkPanel } from "@/components/growth/growth-pk-panel";
import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";
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
  const hasEnoughData = summary.hasEnoughData;

  return (
    <AppShell width="wide" className="pb-12">
      <AppShellHero
        eyebrow="Growth Analysis"
        title="成长分析总览"
        description="先看能力分布和诊断结论，再决定优先优化哪一段内容结构，避免在细节里反复试错。"
        meta={
          <div className="dashboard-summary-chip text-xs sm:text-sm">
            <Sparkles className="size-3.5" />
            {hasEnoughData ? "已满足最小样本要求" : `再提交 ${3 - reportCount} 天即可解锁完整分析`}
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
              hint: hasEnoughData ? "可生成完整分析" : "样本还在累积",
              tone: hasEnoughData ? "success" : "warning",
            },
            {
              label: "当前最弱项",
              value: summary.weakestDimension ?? "待积累",
              hint: "优先优化这个维度",
              tone: summary.weakestDimension ? "warning" : "neutral",
            },
          ]}
        />
      </AppShellHero>

      {!hasEnoughData ? (
        <AppShellSection eyebrow="Activation" title="先完成连续提交" description="成长分析需要连续样本，样本够了再看诊断会更准。">
          <EmptyState
            icon={BarChart2}
            title="连续提交 3 天后解锁分析"
            description={`当前已有 ${reportCount} 条数据，再提交 ${3 - reportCount} 天即可解锁成长分析`}
            className="py-16"
          />
        </AppShellSection>
      ) : (
        <div className="space-y-8">
          <AppShellSection
            eyebrow="Performance Snapshot"
            title="先看结果变化"
            description="这组数字先回答最近 7 天是变好还是变差。"
            meta={<div className="dashboard-summary-chip"><TrendingUp className="size-3.5" /> 最近 7 天 vs 上一个 7 天</div>}
          >
            <StatusCardGrid items={statusCards} />
          </AppShellSection>

          <AppShellSection
            eyebrow="Capability Map"
            title="再看能力分布"
            description="六维能力和弱项对标放在一起，看清差距来自哪里。"
            meta={<div className="dashboard-summary-chip"><Target className="size-3.5" /> 当前最弱项：{summary.weakestDimension ?? "待积累"}</div>}
          >
            <六维雷达面板 capabilityCards={capabilityCards} weakBenchmarkCards={weakBenchmarkCards} teamMembers={teamMembers} />
          </AppShellSection>

          {pkPanel ? (
            <AppShellSection eyebrow="Peer Battle" title="同标签对比" description="和最接近你的对手对比，优先找能直接复制的差距。">
              <GrowthPkPanel leftName={pkPanel.leftName} rightName={pkPanel.rightName} rows={pkPanel.rows} />
            </AppShellSection>
          ) : null}

          <AppShellSection eyebrow="Diagnosis" title="诊断建议" description="结合团队均值，先明确当前最该动的地方。">
            <DiagnosisCard myReports={myReports} teamReports={teamReports} />
          </AppShellSection>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <AppShellSection eyebrow="Script Review" title="文案拆解" description="先定位问题发生在开头、中段还是结尾。">
              <ScriptBreakdown title="文案拆解" data={scriptBreakdown} />
            </AppShellSection>

            <AppShellSection eyebrow="Action Plan" title="AI 洞察与行动建议" description="把结论、证据、示例和动作收成一套。">
              <GrowthActionPlanPanel advice={advice} noData={myReports.length === 0} />
            </AppShellSection>
          </div>
        </div>
      )}
    </AppShell>
  );
}
