import { redirect } from "next/navigation";
import { Suspense } from "react";

import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { loadFulfillmentCalendar } from "@/lib/loaders/fulfillment-page";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import type { TimeRangePreset } from "@/types/fulfillment";

import { FulfillmentWorkbench } from "./fulfillment-workbench";

interface FulfillmentPageProps {
  searchParams: Promise<{ year?: string; month?: string; range?: string }>;
}

function clampMonth(value: number) {
  if (value < 1) return 1;
  if (value > 12) return 12;
  return value;
}

function resolveYearMonth(year: string | undefined, month: string | undefined) {
  const now = new Date();
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  return {
    year: Number.isFinite(parsedYear) && parsedYear > 2000 ? parsedYear : now.getFullYear(),
    month: Number.isFinite(parsedMonth) ? clampMonth(parsedMonth) : now.getMonth() + 1,
  };
}

function resolveRange(range: string | undefined): TimeRangePreset {
  const validRanges: TimeRangePreset[] = ["today", "last7days", "thisMonth", "lastMonth", "custom"];
  if (validRanges.includes(range as TimeRangePreset)) {
    return range as TimeRangePreset;
  }
  return "today";
}

export default async function FulfillmentPage({ searchParams }: FulfillmentPageProps) {
  const params = await searchParams;
  const context = await getCurrentPermissionContext("company", null);
  if (!context) redirect("/login");

  const { permissionInfo, scope } = context;
  if (!canAccessAdminPath("/admin/fulfillment", permissionInfo.businessRole, permissionInfo.permissions)) {
    redirect("/dashboard");
  }

  const { year, month } = resolveYearMonth(params.year, params.month);
  const range = resolveRange(params.range);

  return (
    <AdminWorkspaceLayout indexItems={[]} width="wide">
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-stone-400">发布履约</p>
          <h1 className="mt-1 text-[18px] font-medium tracking-tight text-stone-800">发布履约工作台</h1>
        </div>
        <Suspense fallback={<TableSkeleton columnCount={7} rowCount={6} showHeader={true} />}>
          <FulfillmentDataContainer year={year} month={month} visibleUserIds={scope.visibleUserIds} range={range} />
        </Suspense>
      </div>
    </AdminWorkspaceLayout>
  );
}

async function FulfillmentDataContainer({ year, month, visibleUserIds, range }: { year: number, month: number, visibleUserIds: string[], range: TimeRangePreset }) {
  const data = await loadFulfillmentCalendar(year, month, visibleUserIds);
  return <FulfillmentWorkbench initialData={data} initialRange={range} />;
}
