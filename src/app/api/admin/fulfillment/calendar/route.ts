import { NextRequest, NextResponse } from "next/server";

import { loadFulfillmentCalendar, resolveFulfillmentYearMonth } from "@/lib/loaders/fulfillment-page";
import { resolveReadOnlyCompanyScope } from "@/lib/data-access-scope";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor({ requiredPermission: "view_analytics" });
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const yearStr = request.nextUrl.searchParams.get("year");
  const monthStr = request.nextUrl.searchParams.get("month");
  if (yearStr) {
    const parsedYear = Number(yearStr);
    if (!Number.isFinite(parsedYear) || parsedYear <= 2000) {
      return NextResponse.json({ error: "年份或月份格式不正确" }, { status: 400 });
    }
  }
  if (monthStr) {
    const parsedMonth = Number(monthStr);
    if (!Number.isFinite(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
      return NextResponse.json({ error: "年份或月份格式不正确" }, { status: 400 });
    }
  }
  const { year, month } = resolveFulfillmentYearMonth(yearStr, monthStr);

  try {
    const scope = await resolveReadOnlyCompanyScope(
      createAdminClient(),
      auth.context?.scope ?? {
        userId: auth.actor.userId,
        role: auth.actor.role,
        permissions: auth.actor.permissions,
        teamId: auth.actor.teamId ?? null,
        kind: auth.actor.dataScope,
        visibleUserIds: auth.actor.activeVisibleUserIds ?? [auth.actor.userId],
        activeVisibleUserIds: auth.actor.activeVisibleUserIds ?? [auth.actor.userId],
      },
    );
    const data = await loadFulfillmentCalendar(year, month, scope.activeVisibleUserIds ?? scope.visibleUserIds);
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[fulfillment/calendar] failed to load calendar", error);
    return NextResponse.json({ error: "加载日历失败" }, { status: 500 });
  }
}
