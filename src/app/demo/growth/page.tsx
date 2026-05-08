import { AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
import { DemoGrowthDeepDive } from "@/components/demo/demo-growth-deep-dive";
import { DemoModeChip } from "@/components/demo/demo-nav";
import { CapabilityGrid } from "@/components/growth/capability-grid";
import { GrowthPkPanel } from "@/components/growth/growth-pk-panel";
import { ScriptBreakdown } from "@/components/growth/script-breakdown";
import { StatusCardGrid } from "@/components/growth/status-card-grid";
import { WeaknessBenchmarkGrid } from "@/components/growth/weakness-benchmark-grid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDemoGrowthPageData } from "@/lib/demo-data";

export default function DemoGrowthPage() {
  const data = getDemoGrowthPageData();

  return (
    <AppShell width="wide" className="pb-10">
      <AppShellHero
        eyebrow="Demo Growth"
        title="成长分析保留诊断、对标和文案拆解"
        description="这一页重点让外部访客看到：数据结论如何被组织成问题、标杆、PK 和文案建议。"
        meta={<DemoModeChip />}
      >
        <StatusCardGrid items={data.statusCards} />
      </AppShellHero>

      <AppShellSection
        eyebrow="Capability"
        title="六维能力面板"
        description="演示数据按 30 天样本生成，让评分分布和强弱提示更像真实环境。"
      >
        <CapabilityGrid items={data.capabilityCards} />
      </AppShellSection>

      <AppShellSection
        eyebrow="Performance"
        title="最近 7 天表现拆开看"
        description="补上更具体的指标、样本和优先动作，让成长分析不只是抽象结论。"
      >
        <DemoGrowthDeepDive
          overview={data.overview}
          recentSamples={data.recentSamples}
          priorityActions={data.priorityActions}
        />
      </AppShellSection>

      <AppShellSection
        eyebrow="Benchmark"
        title="弱项对标"
        description="保留“问题在哪里”到“该学谁”的过渡，让别人更容易给出产品层建议。"
      >
        <WeaknessBenchmarkGrid items={data.weakBenchmarkCards} />
      </AppShellSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
          <GrowthPkPanel
            leftName={data.pkPanel.leftName}
            rightName={data.pkPanel.rightName}
            rows={data.pkPanel.rows}
          />
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
          <ScriptBreakdown title="文案拆解" data={data.scriptBreakdown} />
        </div>
      </div>

      <AppShellSection
        eyebrow="Advice"
        title="AI 建议输出格式"
        description="这里不调用真实模型，只展示正式站里的结论排版与信息节奏。"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            { title: "一句诊断", content: data.advice.diagnosis },
            { title: "参考示例", content: data.advice.reference },
            { title: "下一步动作", content: data.advice.action },
          ].map((item) => (
            <Card key={item.title} className="border-white/70 bg-white/82 shadow-[var(--shadow-card)]">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  <span>{item.title}</span>
                  <Badge variant="outline" className="rounded-full">
                    演示输出
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-[var(--color-text-secondary)]">{item.content}</CardContent>
            </Card>
          ))}
        </div>
      </AppShellSection>
    </AppShell>
  );
}
