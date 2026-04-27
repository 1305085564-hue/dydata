import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AdminSecondaryNav, AppShell, AppShellHero } from "@/components/app-shell";
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
  });

  return (
    <AppShell width="wide" className="pb-10">
      <AppShellHero
        eyebrow="Business Analytics"
        title="经营分析"
        bodyClassName="space-y-3 p-4 sm:p-4 lg:p-5"
        meta={
          <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-1 text-xs text-[var(--color-text-secondary)] shadow-[var(--shadow-light)]">
            <span className="size-1.5 rounded-full bg-[var(--color-primary)]" aria-hidden />
            <span className="font-medium text-[var(--color-text-primary)]">分析周期</span>
            <span>
              {data.range.from} 至 {data.range.to}
            </span>
          </div>
        }
      >
        <AdminSecondaryNav
          pathname="/admin/analytics"
          canManageAdmin={data.isPrivilegedUser}
          panelBasePath="/admin"
          userRole={data.role as "owner" | "admin" | "member"}
        />
        <AnalyticsPageHeader preset={data.range.preset} from={data.range.from} to={data.range.to} />
      </AppShellHero>

      <AnalyticsContent
        userId={user.id}
        isPrivilegedUser={data.isPrivilegedUser}
        filteredReports={data.filteredReports}
        filteredVideos={data.filteredVideos}
        filteredSnapshots={data.filteredSnapshots}
        filteredVideoTags={data.filteredVideoTags}
        submitters={data.submitters}
      />
    </AppShell>
  );
}
