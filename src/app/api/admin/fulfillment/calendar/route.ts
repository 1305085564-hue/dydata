import { NextRequest, NextResponse } from "next/server";

import { loadFulfillmentCalendar } from "@/lib/loaders/fulfillment-page";
import { requireAdminServiceClient, requireOwnerOrAdminRole } from "../_shared";

export async function GET(request: NextRequest) {
  const auth = await requireAdminServiceClient();
  const forbidden = requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

  const yearStr = request.nextUrl.searchParams.get("year");
  const monthStr = request.nextUrl.searchParams.get("month");

  const now = new Date();
  const year = yearStr ? Number(yearStr) : now.getFullYear();
  const month = monthStr ? Number(monthStr) : now.getMonth() + 1;

  if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "年份或月份格式不正确" }, { status: 400 });
  }

  try {
    const data = await loadFulfillmentCalendar(year, month, auth.scope.visibleUserIds);
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[fulfillment/calendar] failed to load calendar", error);
    return NextResponse.json({ error: "加载日历失败" }, { status: 500 });
  }
}
