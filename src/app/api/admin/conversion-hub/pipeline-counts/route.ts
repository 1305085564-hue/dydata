import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonBadRequest, parseWeekStart, requireAdminServiceClient, unwrapRpc } from "../_shared";

export async function GET(request: NextRequest) {
  const weekStart = parseWeekStart(request);
  if (!weekStart) return jsonBadRequest("week_start 必须是 YYYY-MM-DD");

  const auth = await requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("conversion_hub_pipeline_counts", {
    week_start: weekStart,
  });
  const unwrapped = unwrapRpc<Record<string, number>>(result, "获取转化中心计数失败");
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json(unwrapped.data ?? {});
}
