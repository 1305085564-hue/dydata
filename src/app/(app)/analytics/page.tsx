import { redirect } from "next/navigation";
import type { VideoMetricsSnapshot, VideoTag } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsPageHeader } from "@/components/analytics/分析页顶部";
import { type AnalyticsRangePreset } from "@/lib/analytics-access";
import { AnalyticsSections } from "@/app/(app)/admin/analytics/analytics-sections";
import type { AnalyticsSection } from "@/app/(app)/admin/analytics/analytics-sections";
import { HitAnalyzer } from "@/app/(app)/admin/analytics/hit-analyzer";
import { PersonnelAnalysis } from "@/app/(app)/admin/analytics/personnel-analysis";
import { TimeAnalysis } from "@/app/(app)/admin/analytics/time-analysis";
import { AiInsight } from "@/app/(app)/admin/analytics/ai-insight";
import { 视频结论卡 } from "@/app/(app)/admin/analytics/视频结论卡";
import type { AnalyticsVideoRow } from "@/app/(app)/admin/analytics/视频结论卡-类型";
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
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <AnalyticsPageHeader preset={data.range.preset} from={data.range.from} to={data.range.to} />

        <section className="rounded-[28px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(246,249,255,0.86))] p-5 shadow-[var(--shadow-card)] backdrop-blur-[18px] sm:p-6">
          <div className="mb-6 flex flex-col gap-3 border-b border-white/65 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold tracking-[0.2em] text-[var(--color-text-tertiary)] uppercase">Core Insight Deck</p>
              <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">核心结论区</h2>
              <p className="text-sm leading-6 text-[var(--color-text-secondary)]">先看结果，再决定深入方向。这里优先展示本周期最值得行动的信号。</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)]">
              <span className="size-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden />
              <span className="font-medium text-[var(--color-text-primary)]">首屏优先结论</span>
              <span>{data.range.from} 至 {data.range.to}</span>
            </div>
          </div>

          <视频结论卡
            videos={data.filteredVideos as AnalyticsVideoRow[]}
            snapshots={data.filteredSnapshots as VideoMetricsSnapshot[]}
            videoTags={data.filteredVideoTags as VideoTag[]}
          />
        </section>
      </div>

      <div className="mt-8">
        <AnalyticsSections sections={sections} />
      </div>
    </div>
  );
}
