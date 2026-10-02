import { NextRequest, NextResponse } from "next/server";

import { loadFulfillmentCalendar, resolveFulfillmentYearMonth } from "@/lib/loaders/fulfillment-page";
import { resolveReadOnlyCompanyScope } from "@/lib/data-access-scope";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor({ requiredPermission: "view_analytics" });
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.context) return NextResponse.json({ error: "用户权限范围加载失败" }, { status: 403 });

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
    // 范围解析要查全公司成员，必须走 service role（auth.supabase 是受 RLS
    // 约束的登录连接，组员用它查本公司成员只会查回自己，月份切换会塌回本人)。
    const scope = await resolveReadOnlyCompanyScope(
      createAdminClient(),
      auth.context.scope,
    );
    const data = await loadFulfillmentCalendar(year, month, scope.activeVisibleUserIds ?? scope.visibleUserIds);
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[fulfillment/calendar] failed to load calendar", error);
    return NextResponse.json({ error: "加载日历失败" }, { status: 500 });
  }
}
