import { redirect } from "next/navigation";
import type { VideoMetricsSnapshot, VideoTag } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { AdminSecondaryNav, AppShell, AppShellHero, AppShellSection } from "@/components/app-shell";
import { AnalyticsPageHeader } from "@/components/analytics/分析页顶部";
import { type AnalyticsRangePreset } from "@/lib/analytics-access";
import { AnalyticsSections } from "./analytics-sections";
import type { AnalyticsSection } from "./analytics-sections";
import { HitAnalyzer } from "./hit-analyzer";
import { PersonnelAnalysis } from "./personnel-analysis";
import { TimeAnalysis } from "./time-analysis";
import { AiInsight } from "./ai-insight";
import { 视频结论卡 } from "./视频结论卡";
import type { AnalyticsVideoRow } from "./视频结论卡-类型";
import { FollowerConvertTrend } from "./follower-convert-trend";
import { AnalyticsHero } from "./analytics-hero";
import { AnalyticsTable } from "./analytics-table";
import { loadAnalyticsPageData } from "@/lib/loaders/analytics-page";

interface AnalyticsPageProps {
  searchParams: Promise<{
    preset?: AnalyticsRangePreset;
    from?: string;
    to?: string;
  }>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const data = await loadAnalyticsPageData({
    supabase,
    userId: user.id,
    preset: (params.preset ?? "30d") as AnalyticsRangePreset,
    from: params.from,
    to: params.to,
  });

  const sections: AnalyticsSection[] = [
    ...(data.isPrivilegedUser
      ? [
          {
            title: "导粉趋势",
            content: <FollowerConvertTrend reports={data.filteredReports} />,
          },
        ]
      : []),
    {
      title: "爆款分析器",
      content: <HitAnalyzer reports={data.filteredReports} submitters={data.submitters} />,
    },
    {
      title: data.isPrivilegedUser ? "人员深度分析" : "我的表现分析",
      content: (
        <PersonnelAnalysis
          reports={data.filteredReports}
          title={data.isPrivilegedUser ? "团队成员表现" : "仅展示我的个人数据"}
        />
      ),
    },
    {
      title: "时间维度分析",
      content: <TimeAnalysis reports={data.filteredReports} />,
    },
    {
      title: "AI 洞察",
      content: <AiInsight scopeEntityId={user.id} />,
    },
  ];

  return (
    <AppShell width="wide" className="pb-10">
      <AppShellHero
        eyebrow="Business Analytics"
        title="经营分析"
        description="先看结果，再决定深入方向。这里优先展示本周期最值得行动的经营信号。"
        meta={
          <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)]">
            <span className="size-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden />
            <span className="font-medium text-[var(--color-text-primary)]">分析周期</span>
            <span>{data.range.from} 至 {data.range.to}</span>
          </div>
        }
      >
        <AdminSecondaryNav pathname="/admin/analytics" canManageAdmin={data.isPrivilegedUser} />
        <AnalyticsPageHeader preset={data.range.preset} from={data.range.from} to={data.range.to} />
      </AppShellHero>
      
      {/* 顶层：Hero 指标区 */}
      <AnalyticsHero reports={data.filteredReports} />

      {/* 中层：视频结论卡 + 各类分析组件 */}
      <AppShellSection
        eyebrow="Core Insight Deck"
        title="核心结论区"
        description="首屏优先展示本周期最值得处理的核心结论。"
      >
        <视频结论卡
          videos={data.filteredVideos as AnalyticsVideoRow[]}
          snapshots={data.filteredSnapshots as VideoMetricsSnapshot[]}
          videoTags={data.filteredVideoTags as VideoTag[]}
        />
      </AppShellSection>

      <div className="mt-8">
        <AnalyticsSections sections={sections} />
      </div>
      
      {/* 底层：明细表格 */}
      <AnalyticsTable videos={data.filteredVideos} />
    </AppShell>
  );
}
