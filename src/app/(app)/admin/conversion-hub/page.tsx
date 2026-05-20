import { redirect } from "next/navigation";

import { getUserPermissions } from "@/lib/permissions";

import { ConversionHubShell } from "./hub-shell";
import {
  canAccessAdminPath,
  getWeekStartDate,
  loadConversionHubData,
  normalizeFormat,
  normalizeSort,
  normalizeStatus,
  normalizeTab,
} from "./data";

export const dynamic = "force-dynamic";

interface HubPageProps {
  searchParams: Promise<{
    tab?: string;
    status?: string;
    category?: string;
    q?: string;
    sort?: string;
    format?: string;
  }>;
}

export default async function ConversionHubPage({ searchParams }: HubPageProps) {
  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (!canAccessAdminPath("/admin/conversion-hub", perm.businessRole, perm.permissions)) redirect("/dashboard");

  const params = await searchParams;
  const activeTab = normalizeTab(params.tab);
  const weekStart = getWeekStartDate();

  const status = normalizeStatus(params.status);
  const category = typeof params.category === "string" ? params.category : "全部";
  const keyword = params.q?.trim() ?? "";
  const sort = normalizeSort(params.sort);
  const format = normalizeFormat(params.format);

  const { violations, pendingViolationsCount, scripts, weekly, analytics } = await loadConversionHubData({
    activeTab,
    status,
    category,
    keyword,
    sort,
    format,
    weekStart,
    includeViolations: true,
  });

  return (
    <ConversionHubShell
      weekStart={weekStart}
      activeTab={activeTab}
      violations={violations}
      pendingViolationsCount={pendingViolationsCount}
      weeklyBuckets={weekly?.buckets ?? null}
      weeklyConfirmedAt={weekly?.confirmedAt ?? null}
      weeklyGeneratedBy={weekly?.generatedBy ?? null}
      analyticsRows={analytics?.rows ?? []}
      analyticsTrend={analytics?.trend ?? []}
      analyticsSort={sort}
      analyticsFormat={format}
      scripts={scripts}
    />
  );
}
