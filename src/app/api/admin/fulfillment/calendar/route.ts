import { NextRequest, NextResponse } from "next/server";

import { loadFulfillmentCalendar, resolveFulfillmentYearMonth } from "@/lib/loaders/fulfillment-page";
import { getActiveVisibleUserIds } from "@/lib/data-access-scope";
import { requireAdminServiceClient, requireOwnerOrAdminRole } from "../_shared";

export async function GET(request: NextRequest) {
  const auth = await requireAdminServiceClient();
  const forbidden = requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

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
    const data = await loadFulfillmentCalendar(year, month, getActiveVisibleUserIds(auth.scope));
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[fulfillment/calendar] failed to load calendar", error);
    return NextResponse.json({ error: "加载日历失败" }, { status: 500 });
  }
}
