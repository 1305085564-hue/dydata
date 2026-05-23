import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonBadRequest, parseBucket, parseWeekStart, requireAdminServiceClient, unwrapRpc } from "../_shared";

/**
 * @deprecated AI 生成逻辑未实现，前端已隐藏入口；保留接口供未来 AI 接通后复用。
 */
export async function GET(request: NextRequest) {
  const weekStart = parseWeekStart(request);
  if (!weekStart) return jsonBadRequest("week_start 必须是 YYYY-MM-DD");

  const bucket = parseBucket(request);
  if (bucket === undefined) return jsonBadRequest("bucket 只能是 promote/test/deprecate/ban");

  const auth = await requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("conversion_hub_weekly_items", {
    week_start: weekStart,
    p_bucket: bucket,
  });
  const unwrapped = unwrapRpc<unknown[]>(result, "获取每周候选列表失败");
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json({ data: unwrapped.data ?? [] });
}
