import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";

import { AnalyticsDataContainer } from "./analytics-data-container";
import AnalyticsLoading from "./loading";

interface AnalyticsPageProps {
  searchParams: Promise<{
    preset?: string;
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

  const permissionInfo = await getUserPermissions();
  if (
    !permissionInfo ||
    !canAccessAdminPath("/admin/analytics", permissionInfo.businessRole, permissionInfo.permissions)
  ) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const currentPreset = params.preset ?? "30d";
  const currentFrom = params.from;
  const currentTo = params.to;

  return (
    <AdminWorkspaceLayout indexItems={[]} width="wide">
      <div className="space-y-4">
        <div>
          <p className="text-[12px] tracking-[0.12em] text-stone-500">经营分析</p>
          <h1 className="mt-1 text-[24px] font-medium tracking-tight text-stone-900">经营分析</h1>
        </div>
        <Suspense
          key={`${currentPreset}-${currentFrom ?? ""}-${currentTo ?? ""}`}
          fallback={<AnalyticsLoading />}
        >
          <AnalyticsDataContainer
            userId={user.id}
            preset={currentPreset}
            from={currentFrom}
            to={currentTo}
          />
        </Suspense>
      </div>
    </AdminWorkspaceLayout>
  );
}
