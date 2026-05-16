import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AnalyticsPageHeader } from "@/components/analytics/分析页顶部";
import { type AnalyticsRangePreset } from "@/lib/analytics-access";
import { loadAnalyticsPageData } from "@/lib/loaders/analytics-page";

import { AnalyticsContent } from "./analytics-content";

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

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">Business Analytics</p>
        <h1 className="mt-1 text-[18px] font-medium tracking-tight text-zinc-800">经营分析</h1>
      </div>
      <AnalyticsPageHeader preset={data.range.preset} from={data.range.from} to={data.range.to} />
      <AnalyticsContent
        userId={user.id}
        isPrivilegedUser={data.isPrivilegedUser}
        filteredReports={data.filteredReports}
        previousPeriodReports={data.previousPeriodReports}
        filteredVideos={data.filteredVideos}
        filteredSnapshots={data.filteredSnapshots}
        filteredVideoTags={data.filteredVideoTags}
        submitters={data.submitters}
      />
    </div>
  );
}
