import type { VideoMetricsSnapshot, VideoTag } from "@/types";
import { AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
import { DemoModeChip } from "@/components/demo/demo-nav";
import { AnalyticsSections } from "@/app/(app)/admin/analytics/analytics-sections";
import type { AnalyticsSection } from "@/app/(app)/admin/analytics/analytics-sections";
import { HitAnalyzer } from "@/app/(app)/admin/analytics/hit-analyzer";
import { PersonnelAnalysis } from "@/app/(app)/admin/analytics/personnel-analysis";
import { TimeAnalysis } from "@/app/(app)/admin/analytics/time-analysis";
import { 视频结论卡 } from "@/app/(app)/admin/analytics/视频结论卡";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDemoAnalyticsPageData } from "@/lib/demo-data";

export default function DemoAnalyticsPage() {
  const data = getDemoAnalyticsPageData();

  const sections: AnalyticsSection[] = [
    {
      id: "hit-analyzer",
      title: "爆款分析器",
      content: <HitAnalyzer reports={data.filteredReports} submitters={data.submitters} />,
    },
    {
      id: "personnel-analysis",
      title: "人员深度分析",
      content: <PersonnelAnalysis reports={data.filteredReports} title="演示团队表现" />,
    },
    {
      id: "time-analysis",
      title: "时间维度分析",
      content: <TimeAnalysis reports={data.filteredReports} />,
    },
    {
      id: "demo-ai",
      title: "AI 洞察（演示）",
      content: (
        <Card className="border-white/70 bg-white/82 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span>AI 洞察结果预览</span>
              <Badge variant="outline" className="rounded-full bg-amber-50 text-amber-700">
                只读
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-[var(--color-text-secondary)]">
            <p>1. 最近 30 天里，“先结论后对比”的题材在大盘复盘和热点追踪里最稳，头部样本的 5 秒留存更高。</p>
            <p>2. 同样是高播放样本，导粉效率差距更大，说明 CTA 表达和结尾动作比题材本身更影响转化。</p>
            <p>3. 如果下一轮要做体验优化，优先看筛选路径、标签解释和结论区的信息层次，而不是再加更多图表。</p>
          </CardContent>
        </Card>
      ),
    },
  ];

  return (
    <AppShell width="wide" className="pb-10">
      <AppShellHero
        eyebrow="Demo Analytics"
        title="完整展示分析页的结构与节奏"
        description="演示环境保留首屏结论区、深度分析区和时间维度区，让外部访客能直接评估信息架构。"
        meta={<DemoModeChip />}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)]">
          <span className="size-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden />
          <span className="font-medium text-[var(--color-text-primary)]">分析周期</span>
          <span>
            {data.range.from} 至 {data.range.to}
          </span>
        </div>
      </AppShellHero>

      <AppShellSection
        eyebrow="Core Insight Deck"
        title="核心结论区"
        description="这里直接复用正式站的爆款结论卡结构，演示访客能完整看到首屏布局。"
      >
        <视频结论卡
          videos={data.filteredVideos as any[]}
          snapshots={data.filteredSnapshots as VideoMetricsSnapshot[]}
          videoTags={data.filteredVideoTags as VideoTag[]}
        />
      </AppShellSection>

      <div className="mt-8">
        <AnalyticsSections sections={sections} />
      </div>
    </AppShell>
  );
}
