import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { resolveReadOnlyCompanyScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFulfillmentCalendar, resolveFulfillmentYearMonth } from "@/lib/loaders/fulfillment-page";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";

import { FulfillmentWorkbench } from "./fulfillment-workbench";
import { FulfillmentPageSkeleton } from "./fulfillment-page-skeleton";

export const metadata: Metadata = {
  title: "发布管理 - DYData",
  description: "管理团队发布计划、发布进度与补交申请。",
};

interface FulfillmentPageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function FulfillmentPage({ searchParams }: FulfillmentPageProps) {
  const params = await searchParams;
  const context = await getCurrentPermissionContext("company", null);
  if (!context) redirect("/login");

  const { permissionInfo, scope } = context;
  if (!canAccessAdminPath("/admin/fulfillment", permissionInfo.role, permissionInfo.permissions)) {
    redirect("/dashboard");
  }

  const { year, month } = resolveFulfillmentYearMonth(params.year, params.month);
  const readOnlyScope = await resolveReadOnlyCompanyScope(createAdminClient(), scope);

  return (
    // 标题由工作台按数据给出（「11月 · 已发 412 / 480 条，达成 86%」），这里不放固定标题与导语
    <AdminWorkspaceLayout width="wide">
      <Suspense fallback={<FulfillmentPageSkeleton />}>
        <FulfillmentDataContainer
          year={year}
          month={month}
          visibleUserIds={readOnlyScope.activeVisibleUserIds}
          currentUserId={permissionInfo.userId}
          canManageSystem={permissionInfo.permissions.manage_system === true}
          canManage={permissionInfo.permissions.manage_fulfillment === true}
        />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}

async function FulfillmentDataContainer({
  year,
  month,
  visibleUserIds,
  currentUserId,
  canManageSystem,
  canManage,
}: {
  year: number;
  month: number;
  visibleUserIds: string[];
  currentUserId: string;
  canManageSystem: boolean;
  canManage: boolean;
}) {
  const data = await loadFulfillmentCalendar(year, month, visibleUserIds);
  return (
    <FulfillmentWorkbench
      initialData={data}
      currentUserId={currentUserId}
      canManageSystem={canManageSystem}
      canManage={canManage}
    />
  );
}
