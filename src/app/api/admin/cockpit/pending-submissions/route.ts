import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { jsonBadRequest, parseDateParam, requireAdminServiceClient, unwrapRpc } from "../_shared";

export async function GET(request: NextRequest) {
  const date = parseDateParam(request);
  if (!date) return jsonBadRequest("date 必须是 YYYY-MM-DD");

  const auth = await requireAdminServiceClient();
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.rpc("admin_pending_submissions_today", { target_date: date });
  const unwrapped = unwrapRpc<unknown[]>(result, "获取待催交成员失败");
  if ("response" in unwrapped) return unwrapped.response;

  return NextResponse.json({ data: unwrapped.data ?? [] });
}
