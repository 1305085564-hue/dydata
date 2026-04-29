import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsPageHeader } from "@/components/analytics/分析页顶部";
import { type AnalyticsRangePreset } from "@/lib/analytics-access";
import { AnalyticsSections } from "@/app/(app)/admin/analytics/analytics-sections";
import type { AnalyticsSection } from "@/app/(app)/admin/analytics/analytics-sections";
import { HitAnalyzer } from "@/app/(app)/admin/analytics/hit-analyzer";
import { PersonnelAnalysis } from "@/app/(app)/admin/analytics/personnel-analysis";
import { TimeAnalysis } from "@/app/(app)/admin/analytics/time-analysis";
import type { TimeAnalysisReport } from "@/app/(app)/admin/analytics/time-analysis-utils";
import { AiInsight } from "@/app/(app)/admin/analytics/ai-insight";
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
    includeVideoDetails: false,
  });

  const sections: AnalyticsSection[] = [
    {
      id: "hit-analyzer",
      title: "爆款分析器",
      content: <HitAnalyzer reports={data.filteredReports} submitters={data.submitters} />,
    },
    {
      id: "personnel-analysis",
      title: data.isPrivilegedUser ? "人员深度分析" : "我的表现分析",
      content: (
        <PersonnelAnalysis
          reports={data.filteredReports}
          title={data.isPrivilegedUser ? "团队成员表现" : "仅展示我的个人数据"}
        />
      ),
    },
    {
      id: "time-analysis",
      title: "时间维度分析",
      content: <TimeAnalysis reports={data.filteredReports as TimeAnalysisReport[]} />,
    },
    {
      id: "ai-insight",
      title: "AI 洞察",
      content: <AiInsight scopeEntityId={user.id} />,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <AnalyticsPageHeader preset={data.range.preset} from={data.range.from} to={data.range.to} />
      </div>

      <div className="mt-6">
        <AnalyticsSections sections={sections} />
      </div>
    </div>
  );
}
