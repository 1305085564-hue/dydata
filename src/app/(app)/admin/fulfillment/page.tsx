import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { resolveReadOnlyCompanyScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFulfillmentCalendar, resolveFulfillmentYearMonth } from "@/lib/loaders/fulfillment-page";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import type { TimeRangePreset } from "@/types/fulfillment";

import { FulfillmentWorkbench } from "./fulfillment-workbench";

export const metadata: Metadata = {
  title: "发布管理 - DYData",
  description: "管理团队发布计划、发布进度与补交申请。",
};

interface FulfillmentPageProps {
  searchParams: Promise<{ year?: string; month?: string; range?: string; view?: string }>;
}

function resolveYearMonth(year: string | undefined, month: string | undefined) {
  return resolveFulfillmentYearMonth(year, month);
}

function resolveRange(range: string | undefined): TimeRangePreset {
  const validRanges: TimeRangePreset[] = ["today", "last7days", "thisMonth", "lastMonth", "custom"];
  if (validRanges.includes(range as TimeRangePreset)) {
    return range as TimeRangePreset;
  }
  return "today";
}

function resolveView(view: string | undefined): "todo" | "matrix" {
  if (view === "todo") return "todo";
  return "matrix";
}

export default async function FulfillmentPage({ searchParams }: FulfillmentPageProps) {
  const params = await searchParams;
  const context = await getCurrentPermissionContext("company", null);
  if (!context) redirect("/login");

  const { permissionInfo, scope } = context;
  if (!canAccessAdminPath("/admin/fulfillment", permissionInfo.role, permissionInfo.permissions)) {
    redirect("/dashboard");
  }

  const { year, month } = resolveYearMonth(params.year, params.month);
  const range = resolveRange(params.range);
  const view = resolveView(params.view);
  const readOnlyScope = await resolveReadOnlyCompanyScope(createAdminClient(), scope);

  return (
    <AdminWorkspaceLayout
      eyebrow="发布管理"
      title="发布与履约总览"
      description="随时了解每位成员的发布节奏，断更与补交都有去处。"
      indexItems={[]}
      width="wide"
    >
      <Suspense fallback={<TableSkeleton columnCount={7} rowCount={6} showHeader={true} />}>
        <FulfillmentDataContainer
          year={year}
          month={month}
          visibleUserIds={readOnlyScope.activeVisibleUserIds ?? readOnlyScope.visibleUserIds}
          currentUserId={permissionInfo.userId}
          canManageSystem={permissionInfo.permissions.manage_system === true}
          canManage={permissionInfo.permissions.manage_fulfillment === true}
          range={range}
          view={view}
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
  range,
  view,
}: {
  year: number;
  month: number;
  visibleUserIds: string[];
  currentUserId: string;
  canManageSystem: boolean;
  canManage: boolean;
  range: TimeRangePreset;
  view: "todo" | "matrix";
}) {
  const data = await loadFulfillmentCalendar(year, month, visibleUserIds);
  return (
    <FulfillmentWorkbench
      initialData={data}
      initialRange={range}
      initialView={view}
      currentUserId={currentUserId}
      canManageSystem={canManageSystem}
      canManage={canManage}
    />
  );
}
