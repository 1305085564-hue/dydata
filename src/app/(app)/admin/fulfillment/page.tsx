import { redirect } from "next/navigation";

import { canAccessAdminPath } from "@/lib/analytics-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { loadFulfillmentCalendar } from "@/lib/loaders/fulfillment-page";

import { FulfillmentWorkbench } from "./fulfillment-workbench";

interface FulfillmentPageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
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

export default async function FulfillmentPage({ searchParams }: FulfillmentPageProps) {
  const params = await searchParams;
  const context = await getCurrentPermissionContext("company", null);
  if (!context) redirect("/login");

  const { permissionInfo, scope } = context;
  if (!canAccessAdminPath("/admin/fulfillment", permissionInfo.businessRole, permissionInfo.permissions)) {
    redirect("/dashboard");
  }

  const { year, month } = resolveYearMonth(params.year, params.month);
  const data = await loadFulfillmentCalendar(year, month, scope.visibleUserIds);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">发布履约</p>
        <h1 className="mt-1 text-[18px] font-medium tracking-tight text-zinc-800">团队发布日历</h1>
      </div>
      <FulfillmentWorkbench data={data} />
    </div>
  );
}
