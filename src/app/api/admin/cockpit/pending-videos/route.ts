import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { filterScopedRows, jsonBadRequest, parseDateParam, parseLimitParam, requireAdminServiceClient, unwrapRpc } from "../_shared";

export async function GET(request: NextRequest) {
  const date = parseDateParam(request);
  if (!date) return jsonBadRequest("date 必须是 YYYY-MM-DD");

  const auth = await requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("admin_pending_videos_today", {
    target_date: date,
    limit_rows: parseLimitParam(request),
  });
  const unwrapped = unwrapRpc<unknown[]>(result, "获取待筛视频失败");
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json({
    data: filterScopedRows(auth.scope, unwrapped.data, (row) => {
      const item = row as { submitted_by?: string | null };
      return item.submitted_by;
    }),
  });
}
