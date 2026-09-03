import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { getActiveVisibleUserIds } from "@/lib/data-access-scope";
import { loadFulfillmentCalendar, resolveFulfillmentYearMonth } from "@/lib/loaders/fulfillment-page";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import type { TimeRangePreset } from "@/types/fulfillment";

import { FulfillmentWorkbench } from "./fulfillment-workbench";

export const metadata: Metadata = {
  title: "发布管理 - DYData",
  description: "管理团队发布计划、发布进度与异常申诉。",
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
  if (view === "matrix") return "matrix";
  return "todo";
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

  return (
    <div className="w-full min-h-screen min-h-dvh bg-[#FBF9F5] text-[#1C1917] -mx-4 -my-6 px-4 py-8 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 transition-colors duration-200">
      <Suspense fallback={<TableSkeleton columnCount={7} rowCount={6} showHeader={true} />}>
        <FulfillmentDataContainer
          year={year}
          month={month}
          visibleUserIds={getActiveVisibleUserIds(scope)}
          currentUserId={permissionInfo.userId}
          range={range}
          view={view}
        />
      </Suspense>
    </div>
  );
}

async function FulfillmentDataContainer({
  year,
  month,
  visibleUserIds,
  currentUserId,
  range,
  view,
}: {
  year: number;
  month: number;
  visibleUserIds: string[];
  currentUserId: string;
  range: TimeRangePreset;
  view: "todo" | "matrix";
}) {
  const data = await loadFulfillmentCalendar(year, month, visibleUserIds);
  return <FulfillmentWorkbench initialData={data} initialRange={range} initialView={view} currentUserId={currentUserId} />;
}
