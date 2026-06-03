import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildFulfillmentCalendarData, resolveFulfillmentDateRange } from "@/lib/loaders/fulfillment-page";
import type { FulfillmentCalendarRpcRow } from "@/lib/loaders/fulfillment-page";

import {
  UUID_PATTERN,
  jsonBadRequest,
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
  requireVisibleUsers,
  unwrapRpc,
} from "../_shared";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId")?.trim() ?? "";
  if (!UUID_PATTERN.test(userId)) return jsonBadRequest("userId 必须是 uuid");

  const range = resolveFulfillmentDateRange({
    preset: request.nextUrl.searchParams.get("preset"),
    startDate: request.nextUrl.searchParams.get("startDate"),
    endDate: request.nextUrl.searchParams.get("endDate"),
  });

  const auth = await requireAdminServiceClient();
  const forbidden = requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;
  const scoped = requireVisibleUsers(auth, [userId]);
  if (scoped) return scoped;

  const result = await auth.supabase.rpc("get_fulfillment_range", {
    p_start_date: range.startDate,
    p_end_date: range.endDate,
    p_visible_user_ids: [userId],
    p_team_id: null,
    p_group_id: null,
  });
  const unwrapped = unwrapRpc<FulfillmentCalendarRpcRow[]>(result, "加载成员发布履约历史失败");
  if ("response" in unwrapped) return unwrapped.response;

  const data = buildFulfillmentCalendarData({
    year: Number(range.startDate.slice(0, 4)),
    month: Number(range.startDate.slice(5, 7)),
    range,
    rows: unwrapped.data ?? [],
  });
  const member = data.members[0] ?? null;
  const history = member
    ? Object.values(member.days).sort((left, right) => right.date.localeCompare(left.date))
    : [];

  return NextResponse.json({
    range,
    member,
    history,
  });
}
