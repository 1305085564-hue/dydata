import type { VideoMetricsSnapshot, VideoTag } from "@/types";
import { AppShell, AppShellHero, AppShellSection, AdminSecondaryNav } from "@/components/app-shell";
import { DemoModeChip } from "@/components/demo/demo-nav";
import { AnalyticsSections } from "@/app/(app)/admin/analytics/analytics-sections";
import type { AnalyticsSection } from "@/app/(app)/admin/analytics/analytics-sections";
import { HitAnalyzer } from "@/app/(app)/admin/analytics/hit-analyzer";
import { PersonnelAnalysis } from "@/app/(app)/admin/analytics/personnel-analysis";
import { TimeAnalysis } from "@/app/(app)/admin/analytics/time-analysis";
import { FollowerConvertTrend } from "@/app/(app)/admin/analytics/follower-convert-trend";
import { 视频结论卡 } from "@/app/(app)/admin/analytics/视频结论卡";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDemoAnalyticsPageData } from "@/lib/demo-data";

export default function DemoAdminAnalyticsPage() {
  const data = getDemoAnalyticsPageData();

  const sections: AnalyticsSection[] = [
    {
      id: "follower-convert-trend",
      title: "导粉趋势",
      content: <FollowerConvertTrend reports={data.filteredReports} />,
    },
    {
      id: "hit-analyzer",
      title: "爆款分析器",
      content: <HitAnalyzer reports={data.filteredReports} submitters={data.submitters} />,
    },
    {
      id: "personnel-analysis",
      title: "人员深度分析",
      content: <PersonnelAnalysis reports={data.filteredReports} title="演示团队成员表现" />,
    },
    {
      id: "time-analysis",
      title: "时间维度分析",
      content: <TimeAnalysis reports={data.filteredReports} />,
    },
    {
      id: "demo-advice",
      title: "经营建议（演示）",
      content: (
        <Card className="border-white/70 bg-white/82 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span>经营建议输出结构</span>
              <Badge variant="outline" className="rounded-full bg-zinc-50 text-[#D99E55]">
                只读
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-[var(--color-text-secondary)]">
            <p>1. 团队播放量的波动主要由题材切换造成，而不是发布频次不足。</p>
            <p>2. 导粉效率最稳的是“结论先行 + 主页承接”的内容结构，说明动作引导比单纯高播放更重要。</p>
            <p>3. 如果要优化后台体验，建议先让结论区和成员分析区的筛选逻辑更一致。</p>
          </CardContent>
        </Card>
      ),
    },
  ];

  return (
    <AppShell width="wide" className="pb-10">
      <AppShellHero
        eyebrow="演示经营分析"
        title="经营分析完整开放，只读展示"
        description="演示版保留后台经营分析的全部核心区块，外部访客能完整评估信息组织方式。"
        meta={<DemoModeChip />}
      >
        <AdminSecondaryNav pathname="/admin/analytics" canManageAdmin hrefPrefix="/demo" />
        <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)]">
          <span className="size-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden />
          <span>
            {data.range.from} 至 {data.range.to}
          </span>
        </div>
      </AppShellHero>

      <AppShellSection
        eyebrow="Core Insight Deck"
        title="核心结论区"
        description="这里复用正式站内容，用虚拟样本保证首屏观感真实。"
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
